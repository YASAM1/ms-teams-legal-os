import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { runTriageWorker } from '@/lib/email/worker';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Drain the ingest queue. Can be called by:
 *   - An authenticated admin via the browser (POST from /admin)
 *   - A cron job with CRON_SECRET (no session)
 *
 * In Phase 3.5+ this becomes the Vercel Queues consumer.
 */
export async function POST(req: NextRequest) {
  const cronAuthorized = isAuthorizedCron(req);
  const session = cronAuthorized ? null : await auth();
  if (!cronAuthorized && !session?.user?.isAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const limitParam = new URL(req.url).searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(100, Number(limitParam))) : 25;

  try {
    const result = await runTriageWorker({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, 'triage worker route failed');
    return NextResponse.json(
      { error: 'worker_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
