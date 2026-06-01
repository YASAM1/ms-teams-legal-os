import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db';
import {
  ensureInboxSubscription,
  listUserSubscriptions,
  deleteSubscription,
} from '@/lib/graph/subscriptions';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveUserId(email: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  return user?.id ?? null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = await resolveUserId(session.user.email);
  if (!userId) return NextResponse.json({ subscriptions: [] });

  const subs = await listUserSubscriptions(userId);
  return NextResponse.json({ subscriptions: subs });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = await resolveUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  try {
    const result = await ensureInboxSubscription(userId);
    return NextResponse.json({ ok: true, subscription: result });
  } catch (err) {
    logger.error({ err, userId }, 'inbox subscription create failed');
    return NextResponse.json(
      { error: 'subscription_failed', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = await resolveUserId(session.user.email);
  if (!userId) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

  const url = new URL(req.url);
  const subscriptionId = url.searchParams.get('id');
  if (!subscriptionId) {
    return NextResponse.json({ error: 'missing_subscription_id' }, { status: 400 });
  }

  await deleteSubscription(subscriptionId, userId);
  return NextResponse.json({ ok: true });
}
