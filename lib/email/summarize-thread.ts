import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { graphFetch, graphPaginate } from '@/lib/graph/client';
import { redactPII } from '@/lib/pii';
import { logger } from '@/lib/logger';

const ThreadSummarySchema = z.object({
  headline: z.string().min(5).max(140).describe('1-line headline capturing the thread state.'),
  summary: z.string().min(20).max(1200).describe('Chronological summary in 3-6 short paragraphs. No legal opinions.'),
  openQuestions: z.array(z.string().min(3).max(200)).max(8),
  actionItems: z.array(z.string().min(3).max(200)).max(8),
  participants: z.array(z.string()).max(20),
});

export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

const SYSTEM = `You summarize email threads for a California plaintiff-side personal-injury and civil-litigation firm.
- Be neutral and factual; no legal opinions.
- Order summary chronologically — earliest to latest.
- Open questions = unresolved items in the thread, not new questions you invent.
- Action items = concrete tasks the attorney should do next.`;

type ThreadMessage = {
  id: string;
  receivedDateTime: string;
  subject: string | null;
  bodyPreview: string | null;
  body: { contentType: 'text' | 'html'; content: string };
  from: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { name?: string; address: string } }[];
};

/**
 * Resolve a user-supplied identifier to a Graph message. Accepts:
 *  - A Graph message id (long base64-ish string starting with AAMk…)
 *  - An RFC 2822 internetMessageId in angle brackets (`<abc@example.com>`)
 *  - A bare RFC 2822 internetMessageId (`abc@example.com` with no @ in display name)
 */
async function resolveMessage(userId: string, identifier: string): Promise<ThreadMessage> {
  const trimmed = identifier.trim().replace(/^<|>$/g, '');

  if (trimmed.startsWith('AAMk')) {
    return graphFetch<ThreadMessage>(userId, `/me/messages/${encodeURIComponent(trimmed)}`, {
      query: { $select: 'id,receivedDateTime,subject,bodyPreview,body,from,toRecipients,conversationId' },
    });
  }

  // RFC 2822 internetMessageId lookup — note Graph requires angle brackets in the filter.
  const wrapped = `<${trimmed}>`;
  const search = await graphFetch<{ value: ThreadMessage[] }>(userId, '/me/messages', {
    query: {
      $select: 'id,receivedDateTime,subject,bodyPreview,body,from,toRecipients,conversationId',
      $filter: `internetMessageId eq '${wrapped.replace(/'/g, "''")}'`,
      $top: 1,
    },
  });
  if (search.value.length === 0) {
    throw new Error(`No message matches identifier "${identifier}"`);
  }
  return search.value[0];
}

function stripHtml(html: string): string {
  return html
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
}

export type SummarizeThreadResult = {
  conversationId: string;
  messageCount: number;
  summary: ThreadSummary;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export async function summarizeThread(
  userId: string,
  identifier: string,
): Promise<SummarizeThreadResult> {
  const seed = await resolveMessage(userId, identifier);
  const conversationId = (seed as ThreadMessage & { conversationId?: string }).conversationId;
  if (!conversationId) throw new Error('Resolved message has no conversationId');

  const messages: ThreadMessage[] = [];
  for await (const m of graphPaginate<ThreadMessage>(userId, '/me/messages', {
    query: {
      $select: 'id,receivedDateTime,subject,bodyPreview,body,from,toRecipients',
      $filter: `conversationId eq '${conversationId}'`,
      $orderby: 'receivedDateTime asc',
      $top: 25,
    },
  })) {
    messages.push(m);
    if (messages.length >= 25) break;
  }

  const transcript = messages
    .map((m, i) => {
      const { redacted } = redactPII(stripHtml(m.body.content));
      const from = m.from?.emailAddress?.address ?? 'unknown';
      const subject = m.subject ?? '(no subject)';
      return `--- Message ${i + 1} of ${messages.length} ---
From: ${from}
Received: ${m.receivedDateTime}
Subject: ${subject}

${redacted.slice(0, 4000)}`;
    })
    .join('\n\n');

  const model = 'anthropic/claude-sonnet-4-6';
  const start = Date.now();
  const { object, usage } = await generateObject({
    model: lm('triage'),
    schema: ThreadSummarySchema,
    system: SYSTEM,
    prompt: transcript,
    temperature: 0,
  });

  logger.info(
    {
      userId,
      conversationId,
      messages: messages.length,
      latencyMs: Date.now() - start,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    },
    'thread summarized',
  );

  return {
    conversationId,
    messageCount: messages.length,
    summary: object,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    model,
  };
}

export function formatThreadSummaryMarkdown(result: SummarizeThreadResult): string {
  const lines: string[] = [];
  lines.push(`**${result.summary.headline}**`);
  lines.push('');
  lines.push(`_Thread of ${result.messageCount} message${result.messageCount === 1 ? '' : 's'} · participants: ${result.summary.participants.join(', ') || '—'}_`);
  lines.push('');
  lines.push(result.summary.summary);
  if (result.summary.openQuestions.length) {
    lines.push('');
    lines.push('**Open questions**');
    for (const q of result.summary.openQuestions) lines.push(`- ${q}`);
  }
  if (result.summary.actionItems.length) {
    lines.push('');
    lines.push('**Action items**');
    for (const a of result.summary.actionItems) lines.push(`- ${a}`);
  }
  return lines.join('\n');
}
