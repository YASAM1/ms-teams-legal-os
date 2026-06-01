import { graphFetch } from './client';

export type CreateReplyDraftInput = {
  /** The Graph message id we're replying to. */
  inReplyToMessageId: string;
  /** Plain-text body (Graph wraps it for us). */
  body: string;
  /** Optional subject override. If omitted, Graph uses "Re: <original>". */
  subject?: string;
};

type DraftMessage = {
  id: string;
  webLink: string;
  conversationId: string;
};

/**
 * Create a reply draft in the user's Outlook Drafts folder. We use Graph's
 * `createReply` endpoint so threading + In-Reply-To headers are correct out
 * of the box, then PATCH the body + (optional) subject.
 *
 * Returns the draft Graph id and a webLink suitable for "Open in Outlook".
 */
export async function createReplyDraft(
  userId: string,
  input: CreateReplyDraftInput,
): Promise<{ draftId: string; webLink: string; conversationId: string }> {
  // Step 1: createReply produces an empty reply draft tied to the original thread.
  const created = await graphFetch<DraftMessage>(userId, `/me/messages/${input.inReplyToMessageId}/createReply`, {
    method: 'POST',
  });

  // Step 2: PATCH the body (and subject if overridden).
  const patchBody: Record<string, unknown> = {
    body: { contentType: 'Text', content: input.body },
  };
  if (input.subject) patchBody.subject = input.subject;

  const updated = await graphFetch<DraftMessage>(userId, `/me/messages/${created.id}`, {
    method: 'PATCH',
    body: patchBody,
  });

  return {
    draftId: updated.id,
    webLink: updated.webLink,
    conversationId: updated.conversationId,
  };
}
