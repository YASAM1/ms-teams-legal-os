import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';

export type InboxIngestEvent = {
  userId: string;
  messageId: string;
  source: 'webhook' | 'reconcile';
};

/**
 * "Enqueue" an inbox message for triage. This is the single producer entry
 * point called from both the webhook receiver (3.3) and the reconcile cron
 * (3.4). Today it writes an audit_log row tagged `graph.ingest.enqueued` —
 * the 3.6 triage worker scans for these and produces `email_summaries`.
 *
 * Dedupes by (userId, graphMessageId) against the `email_summaries.unique`
 * index downstream. We also avoid re-enqueueing if we've already audit-logged
 * an enqueue for this message in the last hour.
 *
 * When Vercel Queues lands, this function becomes the queue producer; the
 * triage worker becomes the consumer with at-least-once delivery + retries.
 */
export async function ingestInboxMessage(event: InboxIngestEvent): Promise<{ accepted: boolean; reason?: string }> {
  const log = logger.child({ ...event, op: 'graph.ingest' });

  // Already triaged?
  const triaged = await db.query.emailSummaries.findFirst({
    where: and(
      eq(schema.emailSummaries.userId, event.userId),
      eq(schema.emailSummaries.graphMessageId, event.messageId),
    ),
  });
  if (triaged) {
    log.debug({ summaryId: triaged.id }, 'message already triaged — skip enqueue');
    return { accepted: false, reason: 'already_triaged' };
  }

  // Already enqueued in the last hour? (dedupe webhook + reconcile races)
  const recentEnqueue = await db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.userId, event.userId),
        eq(schema.auditLog.tool, 'graph.ingest.enqueued'),
        sql`${schema.auditLog.input} ->> 'messageId' = ${event.messageId}`,
        sql`${schema.auditLog.createdAt} > now() - interval '1 hour'`,
      ),
    )
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(1);

  if (recentEnqueue.length > 0) {
    log.debug({ existingAuditId: recentEnqueue[0].id }, 'enqueue already pending — skip');
    return { accepted: false, reason: 'pending_in_queue' };
  }

  await db.insert(schema.auditLog).values({
    userId: event.userId,
    tool: 'graph.ingest.enqueued',
    input: { messageId: event.messageId, source: event.source },
  });

  log.info('message enqueued for triage');
  return { accepted: true };
}

/**
 * For the 3.6 triage worker: return enqueued message IDs that haven't been
 * triaged yet. Ordered oldest-first to drain the queue FIFO.
 */
export async function listPendingTriageIngests(limit = 50): Promise<InboxIngestEvent[]> {
  const rows = await db.execute<{ user_id: string; message_id: string; source: string }>(sql`
    SELECT al.user_id::text AS user_id,
           (al.input ->> 'messageId') AS message_id,
           coalesce(al.input ->> 'source', 'webhook') AS source
    FROM audit_log al
    LEFT JOIN email_summaries es
      ON es.user_id = al.user_id
     AND es.graph_message_id = (al.input ->> 'messageId')
    WHERE al.tool = 'graph.ingest.enqueued'
      AND es.id IS NULL
    ORDER BY al.created_at ASC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    userId: r.user_id,
    messageId: r.message_id,
    source: r.source as 'webhook' | 'reconcile',
  }));
}
