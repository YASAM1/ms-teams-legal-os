import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { graphFetch, graphPaginate } from '@/lib/graph/client';
import { createReplyDraft } from '@/lib/graph/drafts';
import { findMatter } from '@/lib/clio/find-matter';
import { getMatterContext } from '@/lib/clio/matter-context';
import { generateDraftReply } from '@/lib/email/draft-reply';
import { recordMatterUsage } from '@/lib/ai/budget';
import { logger } from '@/lib/logger';

type ThreadMessage = {
  id: string;
  receivedDateTime: string;
  subject: string | null;
  body: { contentType: 'text' | 'html'; content: string };
  from: { emailAddress: { name?: string; address: string } };
  conversationId: string;
};

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

export type DraftPipelineInput = {
  userId: string;
  /** Graph message id of the message to reply to. Drives matter resolution + draft target. */
  messageId: string;
  /** Optional steering directive from the attorney. */
  attorneyDirective?: string;
};

export type DraftPipelineResult = {
  matterDisplayName: string | null;
  draftId: string;
  outlookDraftUrl: string;
  subject: string;
  body: string;
  tone: 'cordial' | 'firm' | 'urgent' | 'sympathetic';
  citedFacts: string[];
  uncertainties: string[];
  validationWarnings: string[];
};

export async function runDraftReplyPipeline(input: DraftPipelineInput): Promise<DraftPipelineResult> {
  const log = logger.child({ userId: input.userId, op: 'draft.pipeline' });

  // 1. Fetch the seed message (must exist; will set the reply target).
  const seed = await graphFetch<ThreadMessage>(input.userId, `/me/messages/${input.messageId}`, {
    query: { $select: 'id,receivedDateTime,subject,body,from,conversationId' },
  });

  // 2. Pull the thread chronologically (oldest → newest).
  const messages: ThreadMessage[] = [];
  for await (const m of graphPaginate<ThreadMessage>(input.userId, '/me/messages', {
    query: {
      $select: 'id,receivedDateTime,subject,body,from,conversationId',
      $filter: `conversationId eq '${seed.conversationId}'`,
      $orderby: 'receivedDateTime asc',
      $top: 25,
    },
  })) {
    messages.push(m);
    if (messages.length >= 25) break;
  }
  log.info({ threadSize: messages.length }, 'thread fetched');

  // 3. Resolve matter from thread subject + bodies (most signal in subject + sender).
  const fromAddress = seed.from?.emailAddress?.address ?? '';
  const matterResolution = await findMatter(
    `${seed.subject ?? ''} ${fromAddress}`,
    { context: messages.slice(-3).map((m) => stripHtml(m.body.content)).join('\n\n').slice(0, 2000) },
  );
  const topCandidate = matterResolution.candidates[0];
  const matterId = topCandidate?.matterId ?? null;
  log.info({ decision: matterResolution.decision, topMatterId: matterId }, 'matter resolved for draft');

  if (!matterId) {
    throw new Error('Could not resolve a matter for this thread. Add an alias or specify the matter manually.');
  }

  // 4. Build matter context.
  const matterContext = await getMatterContext(input.userId, matterId);

  // 5. Format thread transcript for the agent.
  const transcript = messages
    .map(
      (m, i) =>
        `[Message ${i + 1}/${messages.length}] ${m.receivedDateTime} — from ${m.from?.emailAddress?.address ?? 'unknown'}\nSubject: ${m.subject ?? '(no subject)'}\n${stripHtml(m.body.content).slice(0, 3000)}`,
    )
    .join('\n\n---\n\n');

  // 6. Generate draft via Opus.
  const draftResult = await generateDraftReply({
    matterContext,
    threadTranscript: transcript,
    attorneyDirective: input.attorneyDirective,
  });

  // 7. Record budget against the matter.
  await recordMatterUsage({
    matterId,
    model: draftResult.model,
    inputTokens: draftResult.usage.inputTokens,
    outputTokens: draftResult.usage.outputTokens,
  });

  // 8. Create the Outlook draft (replies to the most recent inbound message).
  const replyTarget = messages[messages.length - 1] ?? seed;
  const graphDraft = await createReplyDraft(input.userId, {
    inReplyToMessageId: replyTarget.id,
    body: draftResult.draft.body,
    subject: draftResult.draft.subject,
  });

  // 9. Audit log.
  await db.insert(schema.auditLog).values({
    userId: input.userId,
    tool: 'email.draft.created',
    model: draftResult.model,
    input: { messageId: input.messageId, matterId, attorneyDirective: input.attorneyDirective ?? null },
    output: {
      tone: draftResult.draft.tone,
      bodyPreview: draftResult.draft.body.slice(0, 200),
      citedFactsCount: draftResult.draft.citedFacts.length,
      validationWarningsCount: draftResult.validationWarnings.length,
      graphDraftId: graphDraft.draftId,
    },
  });

  const matter = await db.query.matters.findFirst({
    where: eq(schema.matters.id, matterId),
    columns: { displayName: true },
  });

  return {
    matterDisplayName: matter?.displayName ?? null,
    draftId: graphDraft.draftId,
    outlookDraftUrl: graphDraft.webLink,
    subject: draftResult.draft.subject,
    body: draftResult.draft.body,
    tone: draftResult.draft.tone,
    citedFacts: draftResult.draft.citedFacts,
    uncertainties: draftResult.draft.uncertainties,
    validationWarnings: draftResult.validationWarnings,
  };
}
