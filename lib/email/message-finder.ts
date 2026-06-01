import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { graphFetch } from '@/lib/graph/client';
import { redactPII } from '@/lib/pii';
import { logger } from '@/lib/logger';

type GraphMessageHit = {
  id: string;
  receivedDateTime: string;
  subject: string | null;
  bodyPreview: string | null;
  from: { emailAddress: { name?: string; address: string } };
};

export type MessageCandidate = {
  messageId: string;
  receivedAt: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  bodyPreview: string;
  relevance: number;
  reasoning: string;
};

const RankSchema = z.object({
  ranking: z
    .array(
      z.object({
        index: z.number().int().min(0).describe('Zero-based index into the candidate list.'),
        relevance: z.number().min(0).max(1).describe('1 = exact match, 0 = irrelevant.'),
        reasoning: z.string().max(160).describe('One short sentence on why this matches or does not.'),
      }),
    )
    .min(1)
    .max(10),
});

/**
 * Find an inbox message from a natural-language query. We use Graph's $search
 * to pull up to 20 relevance-ranked hits, then ask Sonnet to re-rank the top
 * candidates with reasoning. Returns the candidates ordered by Sonnet's
 * confidence; the caller decides whether to auto-pick or confirm.
 */
export async function findMessageByNaturalQuery(
  userId: string,
  query: string,
  options: { limit?: number } = {},
): Promise<MessageCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? 6;

  // Graph $search ranks by relevance across subject/body/from/to.
  // It doesn't support $orderby together with $search.
  const hits = await graphFetch<{ value: GraphMessageHit[] }>(userId, '/me/messages', {
    query: {
      $search: `"${trimmed.replace(/"/g, '\\"')}"`,
      $select: 'id,receivedDateTime,subject,bodyPreview,from',
      $top: 20,
    },
  });

  if (!hits.value || hits.value.length === 0) {
    return [];
  }

  // Trim to top 10 + scrub PII before sending to the LLM.
  const trimmedHits = hits.value.slice(0, 10).map((m, i) => ({
    index: i,
    messageId: m.id,
    receivedAt: m.receivedDateTime,
    subject: m.subject ?? '(no subject)',
    fromName: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? 'unknown',
    fromAddress: m.from?.emailAddress?.address ?? 'unknown',
    bodyPreview: redactPII(m.bodyPreview ?? '').redacted.slice(0, 300),
  }));

  const candidateBlock = trimmedHits
    .map(
      (h) =>
        `[${h.index}] ${h.receivedAt} — from ${h.fromName} <${h.fromAddress}>\nSubject: ${h.subject}\nPreview: ${h.bodyPreview}`,
    )
    .join('\n\n');

  const prompt = `Attorney query: ${trimmed}

Candidate inbox messages (Graph relevance-ordered):
${candidateBlock}

Rank candidates by how well they match the attorney's query. Higher relevance = better match. Include reasoning so the attorney can verify.`;

  const start = Date.now();
  const { object } = await generateObject({
    model: lm('triage'),
    schema: RankSchema,
    system:
      'You help a California plaintiff-side litigation attorney pick the right inbox message from a natural-language description. Be conservative — if nothing strongly matches, score everything below 0.5.',
    prompt,
    temperature: 0,
  });

  logger.info(
    { userId, query: trimmed.slice(0, 80), candidates: trimmedHits.length, latencyMs: Date.now() - start },
    'message-finder ranked',
  );

  // Map back to candidates ordered by LLM relevance, capped at `limit`.
  const sorted = object.ranking
    .map((r) => ({ ...r, hit: trimmedHits[r.index] }))
    .filter((r) => r.hit)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);

  return sorted.map((r) => ({
    messageId: r.hit!.messageId,
    receivedAt: r.hit!.receivedAt,
    subject: r.hit!.subject,
    fromName: r.hit!.fromName,
    fromAddress: r.hit!.fromAddress,
    bodyPreview: r.hit!.bodyPreview,
    relevance: r.relevance,
    reasoning: r.reasoning,
  }));
}
