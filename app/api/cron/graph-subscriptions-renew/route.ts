import { NextRequest, NextResponse } from 'next/server';
import { listExpiringSubscriptions, renewSubscription, deleteSubscription } from '@/lib/graph/subscriptions';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Renew anything expiring within the next 12 hours. Cron schedule is every 6h (vercel.ts).
const RENEW_WINDOW_MS = 12 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const expiring = await listExpiringSubscriptions(RENEW_WINDOW_MS);
  const results: Array<{ id: string; status: 'renewed' | 'deleted' | 'error'; reason?: string }> = [];

  for (const sub of expiring) {
    try {
      await renewSubscription(sub.id, sub.userId);
      results.push({ id: sub.id, status: 'renewed' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      logger.warn({ err, subscriptionId: sub.id }, 'subscription renewal failed — cleaning up local record');
      try {
        await deleteSubscription(sub.id, sub.userId);
        results.push({ id: sub.id, status: 'deleted', reason });
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, subscriptionId: sub.id }, 'subscription cleanup failed');
        results.push({ id: sub.id, status: 'error', reason });
      }
    }
  }

  logger.info({ checked: expiring.length, results }, 'graph subscription renewal cron done');
  return NextResponse.json({ ok: true, checked: expiring.length, results });
}
