import { NextRequest, NextResponse } from 'next/server';
import type { Activity } from 'botbuilder';
import { processActivity } from '@/lib/bot/adapter';
import { handleTurn } from '@/lib/bot/handler';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';

  let activity: Activity;
  try {
    activity = (await req.json()) as Activity;
  } catch (err) {
    logger.warn({ err }, 'invalid JSON body on teams messages endpoint');
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    await processActivity(authHeader, activity, handleTurn);
    return new NextResponse(null, { status: 200 });
  } catch (err) {
    logger.error({ err }, 'bot adapter processActivity failed');
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ error: 'bot processing failed' }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, surface: 'teams', service: 'teams-legal-os' });
}
