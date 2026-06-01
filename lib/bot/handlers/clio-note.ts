import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { MessageFactory } from 'botbuilder';
import { db, schema } from '@/db';
import { registerAction } from '@/lib/bot/actions';
import { buildNoteConfirmationCard } from '@/lib/bot/cards';
import { approveProposal, getProposal, markExecuted, markFailed, rejectProposal } from '@/lib/proposals';
import { createClioNote } from '@/lib/clio/notes';
import { recordPositiveAlias, recordNegativeAlias } from '@/lib/clio/aliases';
import { logger } from '@/lib/logger';

type ApprovePayload = {
  kind: 'clio.note.approve';
  proposalId: string;
  note_body?: string;
  matter_override?: string;
};

type RejectPayload = {
  kind: 'clio.note.reject';
  proposalId: string;
};

registerAction('clio.note.approve', async (context, payload, userId) => {
  const p = payload as ApprovePayload;
  const proposal = await getProposal(p.proposalId);
  if (!proposal) return `Proposal ${p.proposalId} not found or expired.`;
  if (proposal.userId !== userId) return 'That proposal does not belong to you.';
  if (proposal.status !== 'pending') return `Proposal already ${proposal.status}.`;

  const matterId = p.matter_override?.trim() || proposal.matterId;
  if (!matterId) return 'No matter selected for this note. Reject and try again with a matter.';

  // Resolve matter → Clio id + display name + originally-proposed matter for alias learning.
  const matter = await db.query.matters.findFirst({
    where: eq(schema.matters.id, matterId),
  });
  if (!matter) return 'Matter not found in our DB. Run a Clio sync.';

  const originallyProposed = proposal.matterId;
  const userChangedMatter = originallyProposed && originallyProposed !== matterId;

  const noteBody = (p.note_body ?? '').trim();
  if (!noteBody) return 'Note body is empty. Reject and try again.';

  // Approve in DB first so concurrent clicks don't double-execute.
  await approveProposal(proposal.id, {
    editedPayload: { noteBody, matterIdUsed: matterId },
  });

  // Idempotency key derived from proposal id ensures retries don't dupe.
  const idempotencyKey = `proposal-${proposal.id}-${randomBytes(4).toString('hex')}`;

  try {
    const result = await createClioNote(userId, {
      clioMatterId: matter.clioId,
      subject: typeof proposal.payload === 'object' && proposal.payload !== null && 'subject' in proposal.payload
        ? String((proposal.payload as Record<string, unknown>).subject ?? 'AI-generated note')
        : 'AI-generated note',
      body: noteBody,
      idempotencyKey,
    });

    await markExecuted(proposal.id, {
      externalId: String(result.clioNoteId),
      externalUrl: result.clioWebUrl,
    });

    // Learn from corrections: if user picked a different matter, record the
    // original query (if present) as a negative alias for the wrong matter
    // and a positive alias for the right one.
    if (userChangedMatter && typeof proposal.payload === 'object' && proposal.payload !== null) {
      const originalQuery = (proposal.payload as Record<string, unknown>).originalQuery;
      if (typeof originalQuery === 'string' && originalQuery.length > 1) {
        await recordNegativeAlias(originallyProposed!, originalQuery);
        await recordPositiveAlias(matterId, originalQuery);
      }
    }

    const card = buildNoteConfirmationCard({
      matterDisplayName: matter.displayName,
      clioNoteUrl: result.clioWebUrl,
      noteBodyPreview: noteBody.slice(0, 280) + (noteBody.length > 280 ? '…' : ''),
    });
    await context.sendActivity(MessageFactory.attachment(card));
    return;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    logger.error({ err, proposalId: proposal.id }, 'clio note write failed');
    await markFailed(proposal.id, reason);
    return `Saving to Clio failed — ${reason}.`;
  }
});

registerAction('clio.note.reject', async (_context, payload, userId) => {
  const p = payload as RejectPayload;
  const proposal = await getProposal(p.proposalId);
  if (!proposal) return `Proposal ${p.proposalId} not found.`;
  if (proposal.userId !== userId) return 'That proposal does not belong to you.';
  if (proposal.status !== 'pending') return `Proposal already ${proposal.status}.`;

  await rejectProposal(p.proposalId, 'attorney rejected via card');

  // If a wrong matter was proposed, record the original query as a negative
  // alias so the matter resolver learns.
  if (proposal.matterId && typeof proposal.payload === 'object' && proposal.payload !== null) {
    const originalQuery = (proposal.payload as Record<string, unknown>).originalQuery;
    if (typeof originalQuery === 'string' && originalQuery.length > 1) {
      await recordNegativeAlias(proposal.matterId, originalQuery);
    }
  }

  return 'Rejected. I noted this and will learn from the correction.';
});
