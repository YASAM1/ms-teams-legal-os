import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { logger } from '@/lib/logger';

export const IMPORTANCE_VALUES = ['urgent', 'actionable', 'informational', 'noise'] as const;
export type Importance = (typeof IMPORTANCE_VALUES)[number];

export const TriageSchema = z.object({
  importance: z.enum(IMPORTANCE_VALUES).describe(
    [
      'urgent: court deadline, opposing counsel filing, settlement offer, client emergency',
      'actionable: needs a reply or task within ~24-48h',
      'informational: FYI / scheduling / no immediate action',
      'noise: marketing, newsletters, automated notifications, spam',
    ].join('; '),
  ),
  summary: z.string().min(10).max(800).describe('2-3 sentence neutral summary suitable for a lawyer scanning a digest. No legal opinions.'),
  actionItems: z
    .array(z.string().min(3).max(200))
    .max(8)
    .describe('Concrete tasks for the attorney. Empty array if nothing actionable.'),
  extractedEntities: z.object({
    parties: z.array(z.string()).max(20).describe('People or organizations named in the email (plaintiff, defendant, insurer, witness, opposing counsel, court). Exclude the sender and primary recipient unless they are case parties.'),
    dates: z.array(z.string()).max(20).describe('Important dates with brief context, ISO-8601 where possible (e.g. "2026-06-15: hearing"). Empty if none mentioned.'),
    amounts: z.array(z.string()).max(20).describe('Dollar amounts with context (e.g. "$42,000 settlement offer"). Empty if none.'),
    matterHints: z.array(z.string()).max(10).describe('Free-text hints useful for matching to a Clio matter: client name, accident type, case identifiers. Used downstream by /find-matter.'),
  }),
});

export type TriageOutput = z.infer<typeof TriageSchema>;

const SYSTEM = `You are the triage agent for a California plaintiff-side personal-injury and civil-litigation firm.

Classify an incoming email and extract key facts. Constraints:
- Be conservative on importance. Only mark urgent if there is a hard deadline or opposing counsel action.
- Never invent facts. If a field has no candidates in the email, return an empty array.
- The summary must read in 5-10 seconds. No headers, no preamble — just the substance.
- Action items are for the attorney. Do not write tasks for the AI ("I will follow up...").
- This firm handles MVA, workers comp, premises liability, med mal, employment, animal attacks, civil litigation. Use that vocabulary when extracting matter hints.`;

export type TriageInput = {
  from: string;
  to: string;
  subject: string | null;
  receivedAt: string;
  body: string;
};

export type TriageResult = {
  output: TriageOutput;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export async function triageMessage(input: TriageInput): Promise<TriageResult> {
  const start = Date.now();
  const prompt = buildPrompt(input);
  const model = 'anthropic/claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: lm('triage'),
    schema: TriageSchema,
    system: SYSTEM,
    prompt,
    temperature: 0,
  });

  logger.info(
    {
      latencyMs: Date.now() - start,
      importance: object.importance,
      actionItemsCount: object.actionItems.length,
      partiesCount: object.extractedEntities.parties.length,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    },
    'email triaged',
  );

  return {
    output: object,
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    },
    model,
  };
}

function buildPrompt(input: TriageInput): string {
  const body = input.body.slice(0, 8000); // hard cap to control cost
  return `From: ${input.from}
To: ${input.to}
Subject: ${input.subject ?? '(no subject)'}
Received: ${input.receivedAt}

Body:
${body}`;
}
