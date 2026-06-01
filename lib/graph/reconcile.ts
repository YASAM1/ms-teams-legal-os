import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';
import { graphPaginate } from './client';
import { ingestInboxMessage } from './ingest';

// Look back this far on first reconcile (no checkpoint yet).
const INITIAL_LOOKBACK_MS = 6 * 60 * 60 * 1000; // 6 hours
// Always overlap a small window with the prior checkpoint to absorb clock skew.
const OVERLAP_MS = 60 * 1000; // 60 seconds

type InboxMessage = {
  id: string;
  receivedDateTime: string;
  subject: string;
  internetMessageId: string;
  from: {
    emailAddress: { name?: string; address: string };
  };
};

export type ReconcileResult = {
  userId: string;
  scanned: number;
  latestReceived: Date | null;
};

export async function reconcileInboxForUser(userId: string): Promise<ReconcileResult> {
  const tokenRow = await db.query.graphTokens.findFirst({
    where: eq(schema.graphTokens.userId, userId),
  });
  if (!tokenRow) {
    throw new Error(`No Graph tokens for user ${userId}`);
  }

  const checkpoint = tokenRow.lastReconciledAt ?? new Date(Date.now() - INITIAL_LOOKBACK_MS);
  const since = new Date(checkpoint.getTime() - OVERLAP_MS);
  const sinceIso = since.toISOString();

  const log = logger.child({ userId, op: 'graph.reconcile', sinceIso });
  log.info('starting inbox reconciliation');

  let scanned = 0;
  let latestReceived: Date | null = null;

  const pages = graphPaginate<InboxMessage>(userId, "/me/mailFolders('Inbox')/messages", {
    query: {
      $select: 'id,receivedDateTime,subject,internetMessageId,from',
      $filter: `receivedDateTime ge ${sinceIso}`,
      $orderby: 'receivedDateTime desc',
      $top: 50,
    },
  });

  for await (const msg of pages) {
    scanned += 1;
    const received = new Date(msg.receivedDateTime);
    if (!latestReceived || received > latestReceived) latestReceived = received;

    await ingestInboxMessage({
      userId,
      messageId: msg.id,
      source: 'reconcile',
    });
  }

  const newCheckpoint = latestReceived ?? checkpoint;
  await db
    .update(schema.graphTokens)
    .set({ lastReconciledAt: newCheckpoint })
    .where(eq(schema.graphTokens.userId, userId));

  log.info({ scanned, latestReceived }, 'reconciliation done');
  return { userId, scanned, latestReceived };
}

export async function reconcileAllUsers(): Promise<ReconcileResult[]> {
  const rows = await db
    .select({ userId: schema.graphTokens.userId })
    .from(schema.graphTokens);

  const results: ReconcileResult[] = [];
  for (const { userId } of rows) {
    try {
      results.push(await reconcileInboxForUser(userId));
    } catch (err) {
      logger.error({ err, userId }, 'reconcile failed for user');
      results.push({ userId, scanned: 0, latestReceived: null });
    }
  }
  return results;
}
