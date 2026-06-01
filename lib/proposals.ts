import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';

export type ProposalType = 'email' | 'clio_note' | 'clio_billing' | 'doc_extract';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export type Proposal = typeof schema.draftProposals.$inferSelect;

export type CreateProposalInput = {
  userId: string;
  type: ProposalType;
  matterId: string | null;
  payload: Record<string, unknown>;
};

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  const [row] = await db
    .insert(schema.draftProposals)
    .values({
      userId: input.userId,
      type: input.type,
      matterId: input.matterId,
      payload: input.payload,
      status: 'pending',
    })
    .returning();

  await db.insert(schema.auditLog).values({
    userId: input.userId,
    tool: `proposal.${input.type}.created`,
    input: { proposalId: row.id, matterId: input.matterId },
  });

  logger.info({ proposalId: row.id, type: input.type, matterId: input.matterId }, 'proposal created');
  return row;
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const row = await db.query.draftProposals.findFirst({
    where: eq(schema.draftProposals.id, id),
  });
  return row ?? null;
}

export async function approveProposal(
  id: string,
  options: { editedPayload?: Record<string, unknown>; reason?: string } = {},
): Promise<Proposal> {
  const existing = await getProposal(id);
  if (!existing) throw new Error(`proposal ${id} not found`);
  if (existing.status !== 'pending') {
    throw new Error(`proposal ${id} is ${existing.status}, cannot approve`);
  }

  const now = new Date();
  const nextPayload = options.editedPayload
    ? { ...(existing.payload as Record<string, unknown>), ...options.editedPayload }
    : (existing.payload as Record<string, unknown>);

  const [row] = await db
    .update(schema.draftProposals)
    .set({
      status: 'approved',
      payload: nextPayload,
      statusReason: options.reason ?? null,
      decidedAt: now,
    })
    .where(eq(schema.draftProposals.id, id))
    .returning();

  await db.insert(schema.auditLog).values({
    userId: existing.userId,
    tool: `proposal.${existing.type}.approved`,
    input: { proposalId: id },
    metadata: { edited: Boolean(options.editedPayload), reason: options.reason ?? null },
  });

  return row;
}

export async function rejectProposal(id: string, reason: string): Promise<Proposal> {
  const existing = await getProposal(id);
  if (!existing) throw new Error(`proposal ${id} not found`);
  if (existing.status !== 'pending') {
    throw new Error(`proposal ${id} is ${existing.status}, cannot reject`);
  }

  const [row] = await db
    .update(schema.draftProposals)
    .set({
      status: 'rejected',
      statusReason: reason,
      decidedAt: new Date(),
    })
    .where(eq(schema.draftProposals.id, id))
    .returning();

  await db.insert(schema.auditLog).values({
    userId: existing.userId,
    tool: `proposal.${existing.type}.rejected`,
    input: { proposalId: id },
    metadata: { reason },
  });

  return row;
}

export async function markExecuted(
  id: string,
  executionResult: { externalId: string; externalUrl?: string | null; extra?: Record<string, unknown> },
): Promise<Proposal> {
  const existing = await getProposal(id);
  if (!existing) throw new Error(`proposal ${id} not found`);
  if (existing.status !== 'approved') {
    throw new Error(`proposal ${id} is ${existing.status}, cannot mark executed`);
  }

  const nextPayload = {
    ...(existing.payload as Record<string, unknown>),
    execution: {
      externalId: executionResult.externalId,
      externalUrl: executionResult.externalUrl ?? null,
      ...(executionResult.extra ?? {}),
    },
  };

  const [row] = await db
    .update(schema.draftProposals)
    .set({
      status: 'executed',
      payload: nextPayload,
      executedAt: new Date(),
    })
    .where(eq(schema.draftProposals.id, id))
    .returning();

  await db.insert(schema.auditLog).values({
    userId: existing.userId,
    tool: `proposal.${existing.type}.executed`,
    input: { proposalId: id },
    output: { externalId: executionResult.externalId, externalUrl: executionResult.externalUrl ?? null },
  });

  return row;
}

export async function markFailed(id: string, reason: string): Promise<Proposal> {
  const existing = await getProposal(id);
  if (!existing) throw new Error(`proposal ${id} not found`);

  const [row] = await db
    .update(schema.draftProposals)
    .set({
      status: 'failed',
      statusReason: reason,
    })
    .where(eq(schema.draftProposals.id, id))
    .returning();

  await db.insert(schema.auditLog).values({
    userId: existing.userId,
    tool: `proposal.${existing.type}.failed`,
    input: { proposalId: id },
    metadata: { reason },
  });

  return row;
}

export async function listPendingProposals(userId: string, limit = 25): Promise<Proposal[]> {
  return db.query.draftProposals.findMany({
    where: and(eq(schema.draftProposals.userId, userId), eq(schema.draftProposals.status, 'pending')),
    orderBy: [desc(schema.draftProposals.createdAt)],
    limit,
  });
}
