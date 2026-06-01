import { requireEnv } from '@/lib/env';
import type { ClioTokenSet } from './tokens';

const CLIO_OAUTH_BASE = 'https://app.clio.com/oauth';

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('CLIO_CLIENT_ID'),
    redirect_uri: requireEnv('CLIO_REDIRECT_URI'),
    state,
  });
  return `${CLIO_OAUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<ClioTokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: requireEnv('CLIO_CLIENT_ID'),
    client_secret: requireEnv('CLIO_CLIENT_SECRET'),
    redirect_uri: requireEnv('CLIO_REDIRECT_URI'),
  });

  const res = await fetch(`${CLIO_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clio OAuth code exchange failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
  };
}
