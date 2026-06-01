import { NextRequest, NextResponse } from 'next/server';
import { reconcileAllUsers } from '@/lib/graph/reconcile';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const results = await reconcileAllUsers();
    const totalScanned = results.reduce((sum, r) => sum + r.scanned, 0);
    logger.info({ users: results.length, totalScanned }, 'email reconcile cron done');
    return NextResponse.json({ ok: true, users: results.length, totalScanned, results });
  } catch (err) {
    logger.error({ err }, 'email reconcile cron failed');
    return NextResponse.json(
      { error: 'reconcile_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
