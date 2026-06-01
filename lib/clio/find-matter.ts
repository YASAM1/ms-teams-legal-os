import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { logger } from '@/lib/logger';
import { searchMatters, type MatterSearchCandidate } from './search';

const RERANK_TOP_N = 6;

const RerankSchema = z.object({
  ranking: z
    .array(
      z.object({
        matterId: z.string(),
        relevance: z.number().min(0).max(1).describe('0 = irrelevant, 1 = certain match'),
        reasoning: z.string().describe('one short sentence'),
      }),
    )
    .describe('Top candidates ordered most to least relevant'),
});

export type MatterResolution = {
  candidates: ResolvedCandidate[];
  decision: 'auto_attach' | 'hitl_confirm' | 'flag_low_confidence' | 'no_candidates';
};

export type ResolvedCandidate = MatterSearchCandidate & {
  llmRelevance: number;
  llmReasoning: string;
  finalConfidence: number;
};

export const CONFIDENCE = {
  AUTO_ATTACH: 0.9,
  HITL_CONFIRM: 0.7,
} as const;

const BLEND_HYBRID = 0.4;
const BLEND_LLM = 0.6;

export async function findMatter(
  query: string,
  options: { context?: string; learnedNegatives?: Set<string> } = {},
): Promise<MatterResolution> {
  const log = logger.child({ op: 'find_matter', queryLen: query.length });
  const searchResults = await searchMatters(query, {
    limit: RERANK_TOP_N,
    learnedNegatives: options.learnedNegatives,
  });

  if (searchResults.length === 0) {
    return { candidates: [], decision: 'no_candidates' };
  }

  if (searchResults.length === 1 && searchResults[0].aliasMatch && searchResults[0].hybridScore > 0.5) {
    const sole = searchResults[0];
    return {
      candidates: [{ ...sole, llmRelevance: 1, llmReasoning: 'Exact learned alias match', finalConfidence: 0.99 }],
      decision: 'auto_attach',
    };
  }

  const rerankPrompt = buildRerankPrompt(query, options.context, searchResults);

  const { object } = await generateObject({
    model: lm('router'),
    schema: RerankSchema,
    prompt: rerankPrompt,
    temperature: 0,
  });

  const rerankById = new Map(object.ranking.map((r) => [r.matterId, r]));
  const enriched: ResolvedCandidate[] = searchResults
    .map((c) => {
      const r = rerankById.get(c.matterId);
      const llmRelevance = r?.relevance ?? 0;
      const llmReasoning = r?.reasoning ?? '';
      const finalConfidence = BLEND_HYBRID * c.hybridScore + BLEND_LLM * llmRelevance;
      return { ...c, llmRelevance, llmReasoning, finalConfidence };
    })
    .sort((a, b) => b.finalConfidence - a.finalConfidence);

  const top = enriched[0];
  const decision: MatterResolution['decision'] =
    top.finalConfidence >= CONFIDENCE.AUTO_ATTACH
      ? 'auto_attach'
      : top.finalConfidence >= CONFIDENCE.HITL_CONFIRM
        ? 'hitl_confirm'
        : 'flag_low_confidence';

  log.info(
    {
      decision,
      topConfidence: top.finalConfidence,
      candidates: enriched.length,
    },
    'matter resolution',
  );

  return { candidates: enriched, decision };
}

function buildRerankPrompt(
  query: string,
  context: string | undefined,
  candidates: MatterSearchCandidate[],
): string {
  const candidateList = candidates
    .map(
      (c, i) =>
        `${i + 1}. matterId=${c.matterId} | display="${c.displayName}" | client="${c.clientName ?? ''}" | description="${(c.description ?? '').slice(0, 200)}"`,
    )
    .join('\n');

  return `You are matching a free-text query to candidate legal matters from a California family law firm.

Query: ${query}
${context ? `\nAdditional context (email/chat excerpt):\n${context.slice(0, 1500)}\n` : ''}
Candidates:
${candidateList}

For each candidate, rate relevance 0–1 where:
- 1.0: certain match (party names, matter description, or context align unambiguously)
- 0.7–0.99: probable match (strong overlap, minor ambiguity)
- 0.3–0.69: possible match (some overlap, significant ambiguity)
- 0.0–0.29: unlikely or wrong

Return all candidates in ranking order, most relevant first. If a candidate is clearly wrong, give it a low score — do not pad.`;
}
