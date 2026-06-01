import { generateObject } from 'ai';
import { z } from 'zod';
import { lm } from '@/lib/ai/gateway';
import { redactPII } from '@/lib/pii';
import { graphFetch } from '@/lib/graph/client';
import { logger } from '@/lib/logger';

const NewEmailSchema = z.object({
  toAddresses: z.array(z.string().email()).min(1).max(10).describe('Recipient email addresses. Pull from the description.'),
  ccAddresses: z.array(z.string().email()).max(10).optional(),
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(4000).describe('Plain-text body. No signature block — Outlook adds it.'),
  uncertainties: z.array(z.string()).max(5).describe('Things the attorney should confirm before sending. Empty if confident.'),
});

export type NewEmailDraft = z.infer<typeof NewEmailSchema>;

const SYSTEM = `You draft brand-new outbound emails for a California plaintiff-side personal-injury and civil-litigation firm.

Hard rules:
- Never invent facts. Numbers, dates, party names, settlement amounts, deadlines must come from the attorney's description.
- Recipient email must be explicitly given by the attorney. If they describe a person but no email, return uncertainties saying "no email address provided for {name}" and use a placeholder like "TBD@example.com" so the attorney can fix it in Outlook.
- Plain text. No signature block (Outlook adds it).
- Match register to the situation: warm for personal/social, professional for opposing counsel, concise for opposing carriers.
- Be brief. The attorney can expand if they want more.`;

export type DraftNewInput = {
  description: string;
};

type GraphDraftResponse = { id: string; webLink: string };

export async function generateAndSaveNewDraft(
  userId: string,
  input: DraftNewInput,
): Promise<{
  draft: NewEmailDraft;
  outlookDraftId: string;
  outlookDraftUrl: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const start = Date.now();
  const model = 'anthropic/claude-opus-4-7';

  const { redacted } = redactPII(input.description);

  const { object, usage } = await generateObject({
    model: lm('drafting'),
    schema: NewEmailSchema,
    system: SYSTEM,
    prompt: redacted,
    temperature: 0.3,
  });

  logger.info(
    {
      bodyLength: object.body.length,
      toCount: object.toAddresses.length,
      latencyMs: Date.now() - start,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    },
    'new email drafted',
  );

  // Save to Outlook Drafts via Graph. POST /me/messages creates an unsent draft.
  const draft = await graphFetch<GraphDraftResponse>(userId, '/me/messages', {
    method: 'POST',
    body: {
      subject: object.subject,
      body: { contentType: 'Text', content: object.body },
      toRecipients: object.toAddresses.map((address) => ({ emailAddress: { address } })),
      ccRecipients: (object.ccAddresses ?? []).map((address) => ({ emailAddress: { address } })),
    },
  });

  return {
    draft: object,
    outlookDraftId: draft.id,
    outlookDraftUrl: draft.webLink,
    model,
    usage: { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 },
  };
}
