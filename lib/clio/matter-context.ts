import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { clioFetch } from './client';

export type MatterContext = {
  matterId: string;
  clioMatterId: string;
  displayName: string;
  description: string | null;
  status: string | null;
  customFields: Record<string, unknown>;
  client: {
    name: string | null;
    primaryEmail: string | null;
  };
  recentNotes: Array<{
    clioNoteId: number;
    subject: string | null;
    detail: string | null;
    date: string;
  }>;
};

type ClioNotesResponse = {
  data: Array<{
    id: number;
    subject: string | null;
    detail: string | null;
    date: string;
  }>;
};

export async function getMatterContext(
  userId: string,
  matterId: string,
  options: { recentNoteLimit?: number } = {},
): Promise<MatterContext> {
  const matter = await db.query.matters.findFirst({
    where: eq(schema.matters.id, matterId),
  });
  if (!matter) throw new Error(`matter ${matterId} not found`);

  const client = matter.clientId
    ? await db.query.clients.findFirst({ where: eq(schema.clients.id, matter.clientId) })
    : null;

  const noteLimit = options.recentNoteLimit ?? 5;
  let recentNotes: MatterContext['recentNotes'] = [];
  try {
    const response = await clioFetch<ClioNotesResponse>(userId, '/notes.json', {
      query: {
        'matter_id': Number(matter.clioId),
        'fields': 'id,subject,detail,date',
        'order': 'date(desc)',
        'limit': noteLimit,
      },
    });
    recentNotes = response.data.map((n) => ({
      clioNoteId: n.id,
      subject: n.subject,
      detail: n.detail,
      date: n.date,
    }));
  } catch {
    // Fail soft — empty notes is acceptable for drafting.
    recentNotes = [];
  }

  return {
    matterId: matter.id,
    clioMatterId: matter.clioId,
    displayName: matter.displayName,
    description: matter.description,
    status: matter.status,
    customFields: matter.customFields ?? {},
    client: {
      name: client?.name ?? null,
      primaryEmail: client?.primaryEmail ?? null,
    },
    recentNotes,
  };
}

export function formatMatterContextForPrompt(ctx: MatterContext): string {
  const lines: string[] = [];
  lines.push(`Matter: ${ctx.displayName} (Clio id ${ctx.clioMatterId})`);
  if (ctx.status) lines.push(`Status: ${ctx.status}`);
  if (ctx.description) lines.push(`Description: ${ctx.description}`);
  if (ctx.client.name) {
    lines.push(`Client: ${ctx.client.name}${ctx.client.primaryEmail ? ` <${ctx.client.primaryEmail}>` : ''}`);
  }
  const customEntries = Object.entries(ctx.customFields).filter(([, v]) => v != null && v !== '');
  if (customEntries.length) {
    lines.push('Custom fields:');
    for (const [k, v] of customEntries) lines.push(`  - ${k}: ${String(v)}`);
  }
  if (ctx.recentNotes.length) {
    lines.push('');
    lines.push(`Recent notes (${ctx.recentNotes.length}, newest first):`);
    for (const n of ctx.recentNotes) {
      const detail = (n.detail ?? '').slice(0, 600);
      lines.push(`  • [${n.date}] ${n.subject ?? '(no subject)'}\n    ${detail}`);
    }
  }
  return lines.join('\n');
}
