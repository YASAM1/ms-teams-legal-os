import { NextRequest, NextResponse } from 'next/server';
import { syncAllUsersWithClioTokens } from '@/lib/clio/sync';
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
    const results = await syncAllUsersWithClioTokens();
    const totalClients = results.reduce((sum, r) => sum + r.clientsUpserted, 0);
    const totalMatters = results.reduce((sum, r) => sum + r.mattersUpserted, 0);
    const errors = results.flatMap((r) => r.errors);
    logger.info({ users: results.length, totalClients, totalMatters, errors: errors.length }, 'clio sync cron done');
    return NextResponse.json({ ok: true, users: results.length, totalClients, totalMatters, errors });
  } catch (err) {
    logger.error({ err }, 'clio sync cron failed');
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
