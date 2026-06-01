import { randomBytes } from 'node:crypto';
import { and, eq, ilike } from 'drizzle-orm';
import { MessageFactory } from 'botbuilder';
import { db, schema } from '@/db';
import { registerAction } from '@/lib/bot/actions';
import { buildIntakeConfirmationCard } from '@/lib/bot/cards';
import { approveProposal, getProposal, markExecuted, markFailed, rejectProposal } from '@/lib/proposals';
import { createClioContact, createClioMatter } from '@/lib/clio/matters-write';
import { createClioNote } from '@/lib/clio/notes';
import { logger } from '@/lib/logger';

type ApproveIntakePayload = {
  kind: 'clio.intake.approve';
  proposalId: string;
  client_first_name?: string;
  client_last_name?: string;
  client_email?: string;
  client_phone?: string;
  client_is_existing?: 'true' | 'false';
  matter_description?: string;
  matter_practice_area?: string;
  matter_accident_date?: string;
  matter_location?: string;
  matter_injuries?: string;
  matter_opposing_parties?: string;
  intake_notes?: string;
};

registerAction('clio.intake.approve', async (context, payload, userId) => {
  const p = payload as ApproveIntakePayload;
  const proposal = await getProposal(p.proposalId);
  if (!proposal) return `Proposal ${p.proposalId} not found.`;
  if (proposal.userId !== userId) return 'That proposal does not belong to you.';
  if (proposal.status !== 'pending') return `Proposal already ${proposal.status}.`;

  const firstName = (p.client_first_name ?? '').trim();
  const lastName = (p.client_last_name ?? '').trim();
  if (!firstName || !lastName) return 'Client first and last name are required.';
  const description = (p.matter_description ?? '').trim();
  if (!description) return 'Matter description is required.';

  const isExisting = p.client_is_existing === 'true';
  const email = p.client_email?.trim() || undefined;
  const phone = p.client_phone?.trim() || undefined;

  await approveProposal(proposal.id, {
    editedPayload: {
      finalClient: { firstName, lastName, email, phone, isExisting },
      finalMatter: {
        description,
        practiceArea: p.matter_practice_area,
        accidentDate: p.matter_accident_date,
        location: p.matter_location,
        injuries: p.matter_injuries,
        opposingParties: p.matter_opposing_parties,
      },
      finalNotes: p.intake_notes ?? '',
    },
  });

  try {
    // Resolve or create the client. We try a local DB lookup first (by name)
    // to avoid creating duplicates when the attorney flagged "existing client".
    let clioContactId: number | null = null;
    if (isExisting) {
      const existing = await db.query.clients.findFirst({
        where: and(
          ilike(schema.clients.name, `%${firstName}%${lastName}%`),
        ),
      });
      if (existing) {
        clioContactId = Number(existing.clioId);
      }
    }

    if (!clioContactId) {
      const contactKey = `intake-contact-${proposal.id}-${randomBytes(3).toString('hex')}`;
      const contact = await createClioContact(userId, {
        firstName,
        lastName,
        primaryEmail: email,
        primaryPhone: phone,
        idempotencyKey: contactKey,
      });
      clioContactId = contact.clioContactId;
    }

    const matterKey = `intake-matter-${proposal.id}-${randomBytes(3).toString('hex')}`;
    const matter = await createClioMatter(userId, {
      clientClioId: clioContactId,
      description,
      idempotencyKey: matterKey,
    });

    // Optional intake note alongside the matter so the attorney has structured
    // capture from day one. Only created if the attorney provided notes.
    let intakeNoteUrl: string | null = null;
    const noteBody = buildIntakeNoteBody(p, description);
    if (noteBody.trim().length > 0) {
      try {
        const note = await createClioNote(userId, {
          clioMatterId: String(matter.clioMatterId),
          subject: 'Intake summary',
          body: noteBody,
          idempotencyKey: `intake-note-${proposal.id}`,
        });
        intakeNoteUrl = note.clioWebUrl;
      } catch (noteErr) {
        // Non-fatal: matter is already created.
        logger.warn({ err: noteErr, matterId: matter.clioMatterId }, 'intake note creation failed (matter ok)');
      }
    }

    await markExecuted(proposal.id, {
      externalId: String(matter.clioMatterId),
      externalUrl: matter.clioMatterUrl,
      extra: { contactId: clioContactId, intakeNoteUrl },
    });

    const card = buildIntakeConfirmationCard({
      clientName: `${firstName} ${lastName}`,
      matterDisplayName: matter.displayNumber,
      matterClioId: String(matter.clioMatterId),
      clioMatterUrl: matter.clioMatterUrl,
      noteCreatedUrl: intakeNoteUrl,
    });
    await context.sendActivity(MessageFactory.attachment(card));
    return;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    logger.error({ err, proposalId: proposal.id }, 'intake execution failed');
    await markFailed(proposal.id, reason);
    return `Creating in Clio failed — ${reason}.`;
  }
});

registerAction('clio.intake.reject', async (_context, payload, userId) => {
  const p = payload as { proposalId: string };
  const proposal = await getProposal(p.proposalId);
  if (!proposal) return `Proposal ${p.proposalId} not found.`;
  if (proposal.userId !== userId) return 'That proposal does not belong to you.';
  if (proposal.status !== 'pending') return `Proposal already ${proposal.status}.`;

  await rejectProposal(p.proposalId, 'attorney rejected intake via card');
  return 'Intake rejected.';
});

function buildIntakeNoteBody(p: ApproveIntakePayload, description: string): string {
  const parts: string[] = [description];
  if (p.matter_practice_area) parts.push(`Practice area: ${p.matter_practice_area}`);
  if (p.matter_accident_date) parts.push(`Accident date: ${p.matter_accident_date}`);
  if (p.matter_location) parts.push(`Incident location: ${p.matter_location}`);
  if (p.matter_injuries) parts.push(`Injuries / damages: ${p.matter_injuries}`);
  if (p.matter_opposing_parties) parts.push(`Opposing parties: ${p.matter_opposing_parties}`);
  if (p.intake_notes) parts.push(`Notes: ${p.intake_notes}`);
  return parts.join('\n');
}
