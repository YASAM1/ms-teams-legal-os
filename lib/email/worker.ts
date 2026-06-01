import { db, schema } from '@/db';
import { graphFetch } from '@/lib/graph/client';
import { listPendingTriageIngests, type InboxIngestEvent } from '@/lib/graph/ingest';
import { triageMessage, type TriageOutput } from '@/lib/email/triage';
import { eq } from 'drizzle-orm';
import { findMatter } from '@/lib/clio/find-matter';
import { redactPII } from '@/lib/pii';
import { buildEmailTriageCard } from '@/lib/bot/cards';
import { sendCardToUser } from '@/lib/bot/proactive';
import { recordMatterUsage } from '@/lib/ai/budget';
import { logger } from '@/lib/logger';

type FullMessage = {
  id: string;
  receivedDateTime: string;
  subject: string | null;
  body: { contentType: 'text' | 'html'; content: string };
  internetMessageId: string;
  conversationId: string;
  importance: 'low' | 'normal' | 'high';
  isRead: boolean;
  webLink?: string;
  from: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
};

export type TriageRunResult = {
  total: number;
  triaged: number;
  failed: number;
  skipped: number;
  details: Array<{
    userId: string;
    messageId: string;
    status: 'triaged' | 'failed' | 'skipped';
    reason?: string;
    importance?: TriageOutput['importance'];
  }>;
};

export async function runTriageWorker(options: { limit?: number } = {}): Promise<TriageRunResult> {
  const limit = options.limit ?? 25;
  const pending = await listPendingTriageIngests(limit);
  const log = logger.child({ op: 'email.triage_worker', pendingCount: pending.length });
  log.info('triage worker starting');

  const result: TriageRunResult = { total: pending.length, triaged: 0, failed: 0, skipped: 0, details: [] };

  for (const event of pending) {
    try {
      const status = await triageOne(event);
      if (status === 'triaged') result.triaged += 1;
      else if (status === 'skipped') result.skipped += 1;
      result.details.push({ userId: event.userId, messageId: event.messageId, status });
    } catch (err) {
      result.failed += 1;
      const reason = err instanceof Error ? err.message : 'unknown';
      log.error({ err, userId: event.userId, messageId: event.messageId }, 'triage failed');
      result.details.push({ userId: event.userId, messageId: event.messageId, status: 'failed', reason });

      await db.insert(schema.auditLog).values({
        userId: event.userId,
        tool: 'email.triage.failed',
        input: { messageId: event.messageId },
        metadata: { reason },
      });
    }
  }

  log.info(result, 'triage worker done');
  return result;
}

async function triageOne(event: InboxIngestEvent): Promise<'triaged' | 'skipped'> {
  let message: FullMessage;
  try {
    message = await graphFetch<FullMessage>(event.userId, `/me/messages/${event.messageId}`, {
      query: {
        $select:
          'id,receivedDateTime,subject,body,internetMessageId,conversationId,importance,isRead,webLink,from,toRecipients',
      },
    });
  } catch (err) {
    // 404 = message was deleted between enqueue and triage; mark as skipped (don't retry).
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      logger.warn({ event }, 'message no longer exists in mailbox — skip');
      return 'skipped';
    }
    throw err;
  }

  const bodyRaw = stripHtml(message.body.content);
  const { redacted: bodyText, stats: redactionStats } = redactPII(bodyRaw);
  const fromAddress = message.from?.emailAddress?.address ?? 'unknown';
  const toAddresses = (message.toRecipients ?? [])
    .map((r) => r.emailAddress.address)
    .join(', ');

  if (Object.keys(redactionStats).length > 0) {
    logger.info(
      { messageId: event.messageId, redactionStats },
      'PII redacted before triage',
    );
  }

  const triageResult = await triageMessage({
    from: fromAddress,
    to: toAddresses,
    subject: message.subject,
    receivedAt: message.receivedDateTime,
    body: bodyText,
  });
  const triage = triageResult.output;

  // Skip matter resolution for noise — saves a search + LLM call per spam email.
  let matterId: string | null = null;
  let matterConfidence: number | null = null;
  if (triage.importance !== 'noise') {
    const resolution = await resolveMatterForTriage(message.subject, fromAddress, triage);
    matterId = resolution.matterId;
    matterConfidence = resolution.confidencePct;
  }

  // Record token usage against the resolved matter for budget tracking.
  if (matterId) {
    await recordMatterUsage({
      matterId,
      model: triageResult.model,
      inputTokens: triageResult.usage.inputTokens,
      outputTokens: triageResult.usage.outputTokens,
    });
  }

  await db
    .insert(schema.emailSummaries)
    .values({
      graphMessageId: message.id,
      userId: event.userId,
      importance: triage.importance,
      summary: triage.summary,
      actionItems: triage.actionItems,
      receivedAt: new Date(message.receivedDateTime),
      matterId,
      matterConfidence,
    })
    .onConflictDoNothing({
      target: [schema.emailSummaries.graphMessageId, schema.emailSummaries.userId],
    });

  // Proactive Teams card for important emails. We push for urgent + actionable
  // only — informational/noise stay in the digest (Phase 7) so we don't spam
  // the attorney.
  if (triage.importance === 'urgent' || triage.importance === 'actionable') {
    let matterDisplayName: string | null = null;
    if (matterId) {
      const matter = await db.query.matters.findFirst({
        where: eq(schema.matters.id, matterId),
        columns: { displayName: true },
      });
      matterDisplayName = matter?.displayName ?? null;
    }

    const card = buildEmailTriageCard({
      importance: triage.importance,
      subject: message.subject ?? '(no subject)',
      fromAddress,
      receivedAt: new Date(message.receivedDateTime),
      summary: triage.summary,
      actionItems: triage.actionItems,
      matterDisplayName,
      matterConfidencePct: matterConfidence,
      outlookWebLink: message.webLink ?? null,
    });

    const result = await sendCardToUser(event.userId, card);
    if (!result.sent) {
      logger.info(
        { userId: event.userId, reason: result.reason },
        'proactive card not sent — will surface in digest instead',
      );
    }
  }

  await db.insert(schema.auditLog).values({
    userId: event.userId,
    tool: 'email.triage.completed',
    model: 'anthropic/claude-sonnet-4-6',
    input: {
      messageId: event.messageId,
      internetMessageId: message.internetMessageId,
      from: fromAddress,
      subject: message.subject?.slice(0, 200) ?? null,
    },
    output: {
      importance: triage.importance,
      summaryPreview: triage.summary.slice(0, 200),
      actionItemsCount: triage.actionItems.length,
      entities: triage.extractedEntities,
      matterId,
      matterConfidence,
    },
  });

  return 'triaged';
}

async function resolveMatterForTriage(
  subject: string | null,
  fromAddress: string,
  triage: TriageOutput,
): Promise<{ matterId: string | null; confidencePct: number | null }> {
  // Compose a query from entities + subject. Matter hints + parties are most signal-dense.
  const queryParts = [
    ...triage.extractedEntities.matterHints,
    ...triage.extractedEntities.parties,
    subject ?? '',
  ].filter(Boolean);
  const query = queryParts.join(' ').trim();
  if (!query) return { matterId: null, confidencePct: null };

  // Pass the summary as context — helps the LLM re-rank distinguish similar matters.
  const context = `Email from: ${fromAddress}\nSummary: ${triage.summary}`;

  const resolution = await findMatter(query, { context });
  if (resolution.decision === 'no_candidates' || resolution.candidates.length === 0) {
    return { matterId: null, confidencePct: null };
  }
  const top = resolution.candidates[0];
  return {
    matterId: top.matterId,
    confidencePct: Math.round(top.finalConfidence * 100),
  };
}

function stripHtml(html: string): string {
  // Lightweight HTML→text: remove tags, decode common entities, collapse whitespace.
  // For richer extraction we'd use a parser; this is enough for triage prompts.
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}
