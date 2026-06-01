import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { syncClioForUser } from '@/lib/clio/sync';
import { verifyClioSignature, type ClioWebhookEvent } from '@/lib/clio/webhooks';
import { requireEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = requireEnv('CLIO_WEBHOOK_SECRET');
  const signature = req.headers.get('x-clio-signature');

  if (!verifyClioSignature(rawBody, signature, secret)) {
    logger.warn({ hasSignature: Boolean(signature) }, 'Clio webhook signature failed');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let event: ClioWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ClioWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const log = logger.child({ event: event.event, resourceType: event.resource_type, resourceId: event.resource_id });
  log.info('clio webhook received');

  if (event.resource_type === 'matter' || event.resource_type === 'contact') {
    const userIds = (
      await db.select({ userId: schema.clioTokens.userId }).from(schema.clioTokens)
    ).map((r) => r.userId);

    if (userIds[0]) {
      try {
        await syncClioForUser(userIds[0]);
      } catch (err) {
        log.error({ err }, 'partial sync after webhook failed');
      }
    }
  }

  await db.insert(schema.auditLog).values({
    tool: 'clio_webhook',
    input: event as unknown as Record<string, unknown>,
    metadata: { source: 'clio' },
  });

  return NextResponse.json({ ok: true });
}
