import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { ingestInboxMessage } from '@/lib/graph/ingest';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GraphChangeNotification = {
  subscriptionId: string;
  clientState: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData: {
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag'?: string;
    id: string;
  };
  tenantId?: string;
  subscriptionExpirationDateTime: string;
};

type GraphNotificationBatch = {
  value: GraphChangeNotification[];
};

/**
 * Microsoft Graph validates a new subscription by POSTing to the URL with
 * `?validationToken=...`. We must reply 200 with the raw token as text/plain
 * within 10 seconds. (See learn.microsoft.com/.../webhooks#notification-endpoint-validation)
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  }

  let batch: GraphNotificationBatch;
  try {
    batch = (await req.json()) as GraphNotificationBatch;
  } catch (err) {
    logger.warn({ err }, 'graph webhook: invalid json');
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!batch?.value || !Array.isArray(batch.value)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  let accepted = 0;
  let rejected = 0;

  for (const notification of batch.value) {
    const sub = await db.query.graphSubscriptions.findFirst({
      where: eq(schema.graphSubscriptions.id, notification.subscriptionId),
    });
    if (!sub) {
      logger.warn({ subscriptionId: notification.subscriptionId }, 'graph webhook: unknown subscription');
      rejected += 1;
      continue;
    }
    if (sub.clientState !== notification.clientState) {
      logger.warn(
        { subscriptionId: notification.subscriptionId, userId: sub.userId },
        'graph webhook: clientState mismatch — possible spoof',
      );
      rejected += 1;
      continue;
    }

    logger.info(
      {
        userId: sub.userId,
        subscriptionId: notification.subscriptionId,
        changeType: notification.changeType,
        resourceId: notification.resourceData.id,
      },
      'graph notification accepted',
    );

    // Only enqueue created messages for triage. Updates (e.g. read/unread flag
    // flips) are noted in audit log but not re-triaged.
    if (notification.changeType === 'created') {
      await ingestInboxMessage({
        userId: sub.userId,
        messageId: notification.resourceData.id,
        source: 'webhook',
      });
    } else {
      await db.insert(schema.auditLog).values({
        userId: sub.userId,
        tool: 'graph.notification.received',
        input: { resource: notification.resource, changeType: notification.changeType },
        metadata: {
          subscriptionId: notification.subscriptionId,
          resourceId: notification.resourceData.id,
        },
      });
    }

    accepted += 1;
  }

  return NextResponse.json({ accepted, rejected });
}
