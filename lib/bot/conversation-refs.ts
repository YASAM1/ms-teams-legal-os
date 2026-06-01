import { eq } from 'drizzle-orm';
import type { ConversationReference, TurnContext } from 'botbuilder';
import { TurnContext as TurnContextClass } from 'botbuilder';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';

/**
 * Save the conversation reference for the current turn, keyed by the firm user
 * (resolved from the Teams AAD object id on the activity). Idempotent.
 */
export async function captureConversationReference(context: TurnContext): Promise<void> {
  const aadObjectId = context.activity.from?.aadObjectId;
  if (!aadObjectId) return;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.entraOid, aadObjectId),
  });
  if (!user) {
    logger.debug({ aadObjectId }, 'no app user matches teams AAD id — skip conv ref capture');
    return;
  }

  const reference = TurnContextClass.getConversationReference(context.activity);

  await db
    .insert(schema.conversationReferences)
    .values({
      userId: user.id,
      reference: reference as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.conversationReferences.userId,
      set: { reference: reference as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
}

export async function loadConversationReference(userId: string): Promise<Partial<ConversationReference> | null> {
  const row = await db.query.conversationReferences.findFirst({
    where: eq(schema.conversationReferences.userId, userId),
  });
  return (row?.reference as unknown as Partial<ConversationReference>) ?? null;
}
