import { eq } from 'drizzle-orm';
import { MessageFactory, type Attachment } from 'botbuilder';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';
import { loadConversationReference } from './conversation-refs';
import { getAdapterForProactive } from './adapter';
import { requireEnv } from '@/lib/env';

export type ProactiveSendResult =
  | { sent: true }
  | { sent: false; reason: 'no_conversation_reference' | 'send_failed'; error?: string };

/**
 * Send an Adaptive Card to a user via their stored conversation reference.
 * If the user has never DM'd the bot we cannot reach them — return cleanly so
 * the worker can skip without failing the batch.
 */
export async function sendCardToUser(userId: string, card: Attachment, text?: string): Promise<ProactiveSendResult> {
  const reference = await loadConversationReference(userId);
  if (!reference) {
    logger.info({ userId }, 'no conversation reference — user has not opened bot yet');
    return { sent: false, reason: 'no_conversation_reference' };
  }

  try {
    const adapter = getAdapterForProactive();
    await adapter.continueConversationAsync(
      requireEnv('BOT_APP_ID'),
      reference,
      async (context) => {
        const message = MessageFactory.attachment(card);
        if (text) message.text = text;
        await context.sendActivity(message);
      },
    );
    await db.insert(schema.auditLog).values({
      userId,
      tool: 'bot.proactive.card_sent',
      metadata: { hasText: Boolean(text) },
    });
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown';
    logger.error({ err, userId }, 'proactive send failed');
    return { sent: false, reason: 'send_failed', error };
  }
}

export async function userHasConversationReference(userId: string): Promise<boolean> {
  const row = await db.query.conversationReferences.findFirst({
    where: eq(schema.conversationReferences.userId, userId),
    columns: { userId: true },
  });
  return Boolean(row);
}
