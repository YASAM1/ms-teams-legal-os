import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';
import { generateObject, lm } from '@/lib/ai/gateway';
import { loadClioTokens } from '@/lib/clio/tokens';
import { getCalendarEntries, type ClioCalendarEntry } from '@/lib/clio/calendar';
import { getOpenTasks, filterDueByEndOfDay, type ClioTask } from '@/lib/clio/tasks';

const TIMEZONE = 'America/Los_Angeles';
const REPORTING_MODEL = 'anthropic/claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Time helpers — compute the UTC instants bounding "today" in Pacific time.
// ---------------------------------------------------------------------------

export type DayBounds = { start: Date; end: Date; label: string };

function ptDayBounds(now: Date): DayBounds {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(dateParts.find((p) => p.type === 'year')!.value);
  const m = Number(dateParts.find((p) => p.type === 'month')!.value);
  const d = Number(dateParts.find((p) => p.type === 'day')!.value);

  // Read the actual UTC offset for `now` in PT (handles DST: -07:00 or -08:00).
  const offName = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')!.value; // e.g. "GMT-07:00"
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offName);
  const sign = match && match[1] === '-' ? -1 : 1;
  const offsetMin = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : 0;

  // PT midnight, expressed as a UTC instant.
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60_000;
  const start = new Date(startMs);
  const end = new Date(startMs + 24 * 60 * 60 * 1000);

  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);

  return { start, end, label };
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Gathered data — every item carries a stable id so the LLM can reference it
// without ever restating (and possibly fabricating) the underlying facts.
// ---------------------------------------------------------------------------

export type DigestItem = {
  id: string;
  source: 'calendar' | 'task' | 'email';
  title: string;
  detail: string;
  matter: string | null;
  /** Raw timing used only for sorting + the deterministic fallback view. */
  when: string | null;
  overdue?: boolean;
  importance?: string;
};

export type GatheredDay = {
  bounds: DayBounds;
  items: DigestItem[];
  clioConnected: boolean;
  clioError: string | null;
  /** How many open/overdue tasks existed beyond the cap we sent to the planner. */
  tasksTruncated: number;
};

/** Keep the digest scannable and within the planner's bucket caps. */
const MAX_TASKS = 25;

const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Most-overdue and highest-priority first. */
function rankTasks(tasks: ClioTask[]): ClioTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[(a.priority ?? 'normal').toLowerCase()] ?? 1;
    const pb = PRIORITY_RANK[(b.priority ?? 'normal').toLowerCase()] ?? 1;
    if (pa !== pb) return pa - pb;
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return da - db; // oldest due (most overdue) first
  });
}

function calendarItem(e: ClioCalendarEntry, i: number): DigestItem {
  const time = e.all_day ? 'All day' : fmtTime(e.start_at);
  return {
    id: `cal-${i + 1}`,
    source: 'calendar',
    title: e.summary?.trim() || '(untitled event)',
    detail: [time, e.location].filter(Boolean).join(' · '),
    matter: e.matter?.display_number ?? null,
    when: e.start_at,
  };
}

function taskItem(t: ClioTask, i: number, endOfDay: Date): DigestItem {
  const due = t.due_at ? new Date(t.due_at) : null;
  const overdue = !!due && due.getTime() < endOfDay.getTime() - 24 * 60 * 60 * 1000;
  return {
    id: `task-${i + 1}`,
    source: 'task',
    title: t.name?.trim() || '(unnamed task)',
    detail: [overdue ? 'OVERDUE' : 'Due today', t.priority ? `${t.priority} priority` : null]
      .filter(Boolean)
      .join(' · '),
    matter: t.matter?.display_number ?? null,
    when: t.due_at,
    overdue,
  };
}

export async function gatherDay(userId: string, now = new Date()): Promise<GatheredDay> {
  const bounds = ptDayBounds(now);
  const items: DigestItem[] = [];

  // --- Clio: calendar + tasks (degrade gracefully if not connected) ---
  let clioConnected = false;
  let clioError: string | null = null;
  let tasksTruncated = 0;
  const tokens = await loadClioTokens(userId);
  if (tokens) {
    clioConnected = true;
    try {
      const [entries, openTasks] = await Promise.all([
        getCalendarEntries(userId, bounds.start.toISOString(), bounds.end.toISOString()),
        getOpenTasks(userId),
      ]);
      entries.forEach((e, i) => items.push(calendarItem(e, i)));

      const dueTasks = rankTasks(filterDueByEndOfDay(openTasks, bounds.end.toISOString()));
      tasksTruncated = Math.max(0, dueTasks.length - MAX_TASKS);
      dueTasks.slice(0, MAX_TASKS).forEach((t, i) => items.push(taskItem(t, i, bounds.end)));
    } catch (err) {
      clioError = err instanceof Error ? err.message : 'Clio fetch failed';
      logger.warn({ err, userId }, 'today digest: Clio fetch failed');
    }
  }

  // --- Important emails from the last 24h (already triaged in Phase 3) ---
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const emails = await db
    .select({
      summary: schema.emailSummaries.summary,
      importance: schema.emailSummaries.importance,
      receivedAt: schema.emailSummaries.receivedAt,
      actionItems: schema.emailSummaries.actionItems,
      matterName: schema.matters.displayName,
    })
    .from(schema.emailSummaries)
    .leftJoin(schema.matters, eq(schema.emailSummaries.matterId, schema.matters.id))
    .where(
      and(
        eq(schema.emailSummaries.userId, userId),
        gte(schema.emailSummaries.receivedAt, since),
        inArray(schema.emailSummaries.importance, ['urgent', 'actionable']),
      ),
    )
    .orderBy(desc(schema.emailSummaries.receivedAt))
    .limit(25);

  emails.forEach((e, i) => {
    items.push({
      id: `email-${i + 1}`,
      source: 'email',
      title: e.summary.slice(0, 120),
      detail: e.actionItems.length ? `Action: ${e.actionItems[0]}` : e.importance,
      matter: e.matterName ?? null,
      when: e.receivedAt.toISOString(),
      importance: e.importance,
    });
  });

  return { bounds, items, clioConnected, clioError, tasksTruncated };
}

// ---------------------------------------------------------------------------
// Narration — Sonnet prioritizes the gathered items. It only references item
// ids and writes a one-line "why"; it never restates underlying facts. This
// keeps the digest grounded (PRD §9.4: data is deterministic, LLM narrates).
// ---------------------------------------------------------------------------

const PlanRef = z.object({
  id: z.string().describe('The exact id of a provided item, e.g. "task-2".'),
  why: z.string().max(160).describe('One short phrase on why it sits in this bucket. No restating the full item.'),
});

const TodayPlanSchema = z.object({
  headline: z.string().max(200).describe('One sentence framing the day for the attorney.'),
  doFirst: z.array(PlanRef).max(25).describe('🔴 Hard deadlines, court dates, statute/SOL risk, opposing-counsel actions.'),
  doToday: z.array(PlanRef).max(25).describe('🟡 Client-facing or revenue-moving work that should happen today.'),
  batchLater: z.array(PlanRef).max(40).describe('🟢 Administrative / non-urgent items to batch.'),
});

export type TodayPlan = z.infer<typeof TodayPlanSchema>;

const SYSTEM = `You are the daily-planning agent for a California family-law / plaintiff-side firm.
You are given a list of TODAY's calendar events, open/overdue Clio tasks, and important emails — each with a stable id.
Sort EVERY item into exactly one bucket and order items within a bucket by descending urgency:
- doFirst (🔴): hard deadlines, court/hearing dates, statute-of-limitations or filing risk, opposing-counsel actions, anything time-barred.
- doToday (🟡): client-facing or revenue-moving work — calls, drafts, intake follow-ups, billable tasks.
- batchLater (🟢): administrative, informational, low-stakes items.
Rules:
- Reference items ONLY by their given id. Use each id exactly once. Do not invent ids or facts.
- Calendar events with a court/deadline character and OVERDUE tasks belong in doFirst.
- Keep every "why" to a short phrase. The attorney already sees the item text; you only justify the ranking.`;

export type TodayResult = {
  bounds: DayBounds;
  items: DigestItem[];
  plan: TodayPlan | null;
  clioConnected: boolean;
  clioError: string | null;
  tasksTruncated: number;
  usage: { inputTokens: number; outputTokens: number } | null;
};

export async function buildToday(userId: string, now = new Date()): Promise<TodayResult> {
  const gathered = await gatherDay(userId, now);

  if (gathered.items.length === 0) {
    return { ...gathered, plan: null, usage: null };
  }

  const itemLines = gathered.items
    .map((it) => {
      const parts = [`[${it.id}] (${it.source})`, it.title];
      if (it.detail) parts.push(`— ${it.detail}`);
      if (it.matter) parts.push(`{matter ${it.matter}}`);
      return parts.join(' ');
    })
    .join('\n');

  const { object, usage } = await generateObject({
    model: lm('reporting'),
    schema: TodayPlanSchema,
    system: SYSTEM,
    prompt: `Today is ${gathered.bounds.label} (Pacific). Plan these items:\n\n${itemLines}`,
    temperature: 0,
  });

  // Audit the planning call (cross-cutting requirement: every AI action logged).
  await db.insert(schema.auditLog).values({
    userId,
    agent: 'reporting',
    model: REPORTING_MODEL,
    tool: 'today.digest',
    metadata: {
      itemCount: gathered.items.length,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    },
  });

  return {
    ...gathered,
    plan: object,
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

export function formatTodayMarkdown(result: TodayResult): string {
  const byId = new Map(result.items.map((it) => [it.id, it]));
  const lines: string[] = [`📅 **TODAY — ${result.bounds.label}**`, ''];

  const renderBucket = (emoji: string, heading: string, refs: { id: string; why: string }[]) => {
    if (refs.length === 0) return;
    lines.push(`${emoji} **${heading}**`);
    for (const ref of refs) {
      const it = byId.get(ref.id);
      if (!it) continue;
      const matter = it.matter ? ` _(matter ${it.matter})_` : '';
      lines.push(`- **${it.title}**${matter} — ${ref.why}`);
    }
    lines.push('');
  };

  if (result.plan) {
    if (result.plan.headline) {
      lines.push(`_${result.plan.headline}_`, '');
    }
    renderBucket('🔴', 'DO FIRST (deadline / risk)', result.plan.doFirst);
    renderBucket('🟡', 'DO TODAY (client-facing / revenue)', result.plan.doToday);
    renderBucket('🟢', 'BATCH LATER (admin)', result.plan.batchLater);
  } else {
    lines.push('Nothing on your calendar, no tasks due, and no important emails in the last 24 hours. 🎉', '');
  }

  // Footnotes on data coverage so the attorney knows what this is (and isn't).
  const notes: string[] = [];
  if (!result.clioConnected) {
    notes.push('⚠️ Clio is not connected for you — calendar & tasks are missing. Connect Clio from `/admin`.');
  } else if (result.clioError) {
    notes.push(`⚠️ Couldn't reach Clio (${result.clioError}) — calendar & tasks may be incomplete.`);
  }
  if (result.tasksTruncated > 0) {
    notes.push(`_Showing the top ${MAX_TASKS} of ${MAX_TASKS + result.tasksTruncated} open/overdue tasks (by priority, then most overdue). Review the rest in Clio._`);
  }
  notes.push('_Deadlines shown are from your Clio calendar; this does not compute statute-of-limitations dates._');
  if (notes.length) lines.push('---', ...notes);

  return lines.join('\n').trim();
}
