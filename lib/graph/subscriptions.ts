import { randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';
import { graphFetch, webhookNotificationUrl } from './client';

const INBOX_RESOURCE = "me/mailFolders('Inbox')/messages";
const DEFAULT_CHANGE_TYPES = 'created,updated';
// Microsoft Graph max for messages: ~3 days (4230 minutes). We renew well before that.
const SUBSCRIPTION_LIFETIME_MS = 60 * 60 * 24 * 1000 * 2.8; // 2.8 days

type GraphSubscriptionResponse = {
  id: string;
  resource: string;
  changeType: string;
  clientState: string;
  notificationUrl: string;
  expirationDateTime: string;
};

export async function createInboxSubscription(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const clientState = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS);

  const body = {
    changeType: DEFAULT_CHANGE_TYPES,
    notificationUrl: webhookNotificationUrl(),
    resource: INBOX_RESOURCE,
    expirationDateTime: expiresAt.toISOString(),
    clientState,
  };

  const response = await graphFetch<GraphSubscriptionResponse>(userId, '/subscriptions', {
    method: 'POST',
    body,
  });

  await db
    .insert(schema.graphSubscriptions)
    .values({
      id: response.id,
      userId,
      resource: response.resource,
      changeType: response.changeType,
      clientState: response.clientState,
      expiresAt: new Date(response.expirationDateTime),
    })
    .onConflictDoUpdate({
      target: schema.graphSubscriptions.id,
      set: {
        expiresAt: new Date(response.expirationDateTime),
        clientState: response.clientState,
      },
    });

  logger.info({ userId, subscriptionId: response.id, expiresAt: response.expirationDateTime }, 'graph subscription created');
  return { id: response.id, expiresAt: new Date(response.expirationDateTime) };
}

export async function renewSubscription(subscriptionId: string, userId: string): Promise<Date> {
  const newExpiresAt = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS);

  const response = await graphFetch<GraphSubscriptionResponse>(userId, `/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    body: { expirationDateTime: newExpiresAt.toISOString() },
  });

  const expiresAt = new Date(response.expirationDateTime);

  await db
    .update(schema.graphSubscriptions)
    .set({ expiresAt })
    .where(eq(schema.graphSubscriptions.id, subscriptionId));

  logger.info({ subscriptionId, userId, expiresAt }, 'graph subscription renewed');
  return expiresAt;
}

export async function deleteSubscription(subscriptionId: string, userId: string): Promise<void> {
  try {
    await graphFetch<void>(userId, `/subscriptions/${subscriptionId}`, { method: 'DELETE' });
  } catch (err) {
    logger.warn({ err, subscriptionId, userId }, 'graph subscription delete failed (continuing local cleanup)');
  }
  await db.delete(schema.graphSubscriptions).where(eq(schema.graphSubscriptions.id, subscriptionId));
}

export async function listUserSubscriptions(userId: string) {
  return db.query.graphSubscriptions.findMany({
    where: eq(schema.graphSubscriptions.userId, userId),
  });
}

export async function listExpiringSubscriptions(withinMs: number) {
  const cutoff = new Date(Date.now() + withinMs);
  return db.query.graphSubscriptions.findMany({
    where: lt(schema.graphSubscriptions.expiresAt, cutoff),
  });
}

export async function ensureInboxSubscription(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const existing = await db.query.graphSubscriptions.findFirst({
    where: and(
      eq(schema.graphSubscriptions.userId, userId),
      eq(schema.graphSubscriptions.resource, INBOX_RESOURCE),
    ),
  });
  if (existing && existing.expiresAt.getTime() - Date.now() > 60 * 60 * 1000) {
    return { id: existing.id, expiresAt: existing.expiresAt };
  }
  if (existing) {
    return { id: existing.id, expiresAt: await renewSubscription(existing.id, userId) };
  }
  return createInboxSubscription(userId);
}
