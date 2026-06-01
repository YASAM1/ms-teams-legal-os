import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { logger } from '@/lib/logger';

export const IntakeSchema = z.object({
  client: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    primaryEmail: z.string().email().optional(),
    primaryPhone: z.string().min(7).max(30).optional(),
    isExisting: z.boolean().describe('Set true if the caller hinted this client already exists in Clio; the operator will confirm. Default false.'),
  }),
  matter: z.object({
    description: z.string().min(5).max(400).describe('One-sentence matter description.'),
    practiceArea: z.enum([
      'Motor Vehicle Accident',
      'Workers Compensation',
      'Premises Liability',
      'Medical Malpractice',
      'Animal Attack',
      'Employment',
      'Other Civil Litigation',
    ]).describe('Best-fit category for the firm.'),
    accidentDate: z.string().optional().describe('ISO 8601 date if mentioned (YYYY-MM-DD).'),
    incidentLocation: z.string().max(200).optional(),
    injuriesOrDamages: z.string().max(400).optional(),
    opposingParties: z.array(z.string()).max(8).optional(),
  }),
  notes: z.string().max(800).describe('Anything else the operator should capture in the intake note. Empty string if nothing.'),
  confidence: z.number().min(0).max(1).describe('How confident the extraction is, 0-1. Below 0.6 means major fields were guesses.'),
});

export type IntakeProposal = z.infer<typeof IntakeSchema>;

const SYSTEM = `You are an intake extractor for a California plaintiff-side personal-injury and civil-litigation firm.

Task: given a free-form description (chat message, email, voicemail transcript), extract proposed Clio client + matter fields.

Rules:
- Never invent facts. If a field is not in the input, leave it undefined or empty.
- Pick the closest practiceArea from the fixed enum — do not invent new categories.
- accidentDate must be ISO 8601 (YYYY-MM-DD). Convert "last Tuesday" or "two weeks ago" relative to receivedAt if provided.
- isExisting=true only when the input explicitly says "existing client" / "current client" / matches a known case.
- confidence reflects how much of the structured form is grounded in the input.`;

export type IntakeInput = {
  freeText: string;
  receivedAt?: string;
};

export type IntakeResult = {
  proposal: IntakeProposal;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
};

export async function extractIntake(input: IntakeInput): Promise<IntakeResult> {
  const start = Date.now();
  const model = 'anthropic/claude-sonnet-4-6';

  const { object, usage } = await generateObject({
    model: lm('triage'),
    schema: IntakeSchema,
    system: SYSTEM,
    prompt: `Received at: ${input.receivedAt ?? new Date().toISOString()}

Description:
${input.freeText.slice(0, 6000)}`,
    temperature: 0,
  });

  logger.info(
    {
      latencyMs: Date.now() - start,
      confidence: object.confidence,
      practiceArea: object.matter.practiceArea,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    },
    'intake extracted',
  );

  return {
    proposal: object,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
    model,
  };
}
