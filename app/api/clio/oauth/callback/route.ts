import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/db';
import { exchangeCodeForTokens } from '@/lib/clio/oauth';
import { saveClioTokens } from '@/lib/clio/tokens';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get('clio_oauth_state')?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    logger.warn({ hasCode: Boolean(code), stateMatch: state === expectedState }, 'invalid Clio OAuth callback');
    return NextResponse.json({ error: 'invalid_state' }, { status: 400 });
  }

  const email = session.user.email;
  const entraOid = session.user.oid;
  if (!entraOid) {
    logger.warn({ email }, 'session missing entra oid');
    return NextResponse.json({ error: 'missing_entra_oid' }, { status: 400 });
  }

  let user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  if (!user) {
    const [created] = await db
      .insert(schema.users)
      .values({
        entraOid,
        email,
        displayName: session.user.name ?? email,
        role: session.user.isAdmin ? 'admin' : 'attorney',
      })
      .returning();
    user = created;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveClioTokens(user.id, tokens);
  } catch (err) {
    logger.error({ err }, 'Clio token exchange failed');
    return NextResponse.json({ error: 'token_exchange_failed' }, { status: 500 });
  }

  const response = NextResponse.redirect(new URL('/admin?clio=connected', req.url));
  response.cookies.delete('clio_oauth_state');
  return response;
}
