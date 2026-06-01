import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { redactPII } from '@/lib/pii';
import { logger } from '@/lib/logger';
import { formatMatterContextForPrompt, type MatterContext } from '@/lib/clio/matter-context';

export const DraftSchema = z.object({
  subject: z.string().min(3).max(200).describe('Reply subject — typically "Re: <original>".'),
  body: z.string().min(20).max(4000).describe('Plain-text reply. Two short paragraphs is usually right. No legal opinions, no signature block.'),
  tone: z.enum(['cordial', 'firm', 'urgent', 'sympathetic']).describe('Reply tone, chosen to match the situation.'),
  citedFacts: z
    .array(z.string().min(3).max(300))
    .min(1)
    .max(10)
    .describe('List the specific facts from matter context or the thread you relied on. Every numeric/date/party reference in the body must appear here, verbatim or paraphrased. If you cannot ground a claim, do not include it.'),
  uncertainties: z
    .array(z.string())
    .max(5)
    .describe('Questions for the attorney to confirm before sending. Empty if the draft is confident.'),
});

export type Draft = z.infer<typeof DraftSchema>;

const SYSTEM = `You are the drafting agent for a California plaintiff-side personal-injury and civil-litigation firm.

You produce DRAFTS that the attorney will review and send. You never send anything yourself.

Hard rules (still strict — V1 promise is no hallucinations):
- Never invent facts. Numbers, dates, party names, settlement amounts, deadlines must come from the matter context or thread.
- If a fact is needed but not available, do not write it — note it in uncertainties instead.
- Use plain text, no signature block (the attorney's Outlook adds it).
- Reference California-specific procedural rules (CCP, CACI, Evidence Code, MICRA) only if grounded in the context.
- Every cited fact in your body must appear in citedFacts.

Style:
- Write a competent, professional reply. Don't try to mimic the attorney's voice or the recipient's tone — produce a clean, neutral draft the attorney can quickly edit if they want a different register.
- Be concise. Two short paragraphs is usually right.
- For the \`tone\` field, pick whichever of cordial/firm/urgent/sympathetic best fits the SITUATION (not the voice you're imitating). Default to cordial if uncertain.`;

export type DraftReplyInput = {
  matterContext: MatterContext;
  threadTranscript: string; // formatted by caller, oldest→newest
  attorneyDirective?: string; // optional steering ("decline politely", "push for $40k")
};

export type DraftReplyResult = {
  draft: Draft;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  validationWarnings: string[];
};

export async function generateDraftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
  const start = Date.now();
  const model = 'anthropic/claude-opus-4-7';

  const { redacted: redactedThread } = redactPII(input.threadTranscript);
  const matterBlock = formatMatterContextForPrompt(input.matterContext);

  const prompt = [
    'MATTER CONTEXT (the only ground truth alongside the thread):',
    matterBlock,
    '',
    'EMAIL THREAD (oldest to newest):',
    redactedThread,
    input.attorneyDirective ? `\nATTORNEY DIRECTIVE:\n${input.attorneyDirective}` : '',
  ].join('\n');

  const { object, usage } = await generateObject({
    model: lm('drafting'),
    schema: DraftSchema,
    system: SYSTEM,
    prompt,
    temperature: 0.2,
  });

  const validationWarnings = validateDraftAgainstSources(object, input);

  logger.info(
    {
      matterId: input.matterContext.matterId,
      tone: object.tone,
      bodyLength: object.body.length,
      citedFactsCount: object.citedFacts.length,
      validationWarnings: validationWarnings.length,
      latencyMs: Date.now() - start,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    },
    'reply draft generated',
  );

  return {
    draft: object,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    model,
    validationWarnings,
  };
}

/**
 * Hallucination check: every cited fact must appear (loosely) in the matter
 * context or the thread. We use a tokenized substring match — strict enough
 * to catch invented numbers/dates, loose enough not to false-positive on
 * paraphrased sentences.
 */
function validateDraftAgainstSources(draft: Draft, input: DraftReplyInput): string[] {
  const sources = [
    formatMatterContextForPrompt(input.matterContext),
    input.threadTranscript,
  ].join('\n').toLowerCase();

  const warnings: string[] = [];

  // Token-level check: significant numbers (4+ digits) and currency amounts must
  // appear in the source. We don't enforce text claims (loose enforcement; the
  // hard guard is the Zod schema requiring citedFacts at all).
  for (const fact of draft.citedFacts) {
    const numbers = fact.match(/\b\d{4,}\b|\$[\d,]+(?:\.\d{2})?/g) ?? [];
    for (const n of numbers) {
      const needle = n.toLowerCase().replace(/[,$]/g, '');
      const sourceNormalized = sources.replace(/[,$]/g, '');
      if (!sourceNormalized.includes(needle)) {
        warnings.push(`Cited number "${n}" not found in matter context or thread`);
      }
    }
  }

  // Same check on the body itself — catches numbers introduced without a cite.
  const bodyNumbers = draft.body.match(/\b\d{4,}\b|\$[\d,]+(?:\.\d{2})?/g) ?? [];
  for (const n of bodyNumbers) {
    const needle = n.toLowerCase().replace(/[,$]/g, '');
    const sourceNormalized = sources.replace(/[,$]/g, '');
    if (!sourceNormalized.includes(needle)) {
      warnings.push(`Body contains number "${n}" not grounded in sources`);
    }
  }

  return warnings;
}
