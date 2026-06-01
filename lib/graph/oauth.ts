import { requireEnv } from '@/lib/env';
import type { GraphTokenSet } from './tokens';

export const GRAPH_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Files.ReadWrite.All',
] as const;

function authority(): string {
  const tenant = requireEnv('ENTRA_TENANT_ID');
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
}

export function buildGraphAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('ENTRA_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: requireEnv('GRAPH_REDIRECT_URI'),
    response_mode: 'query',
    scope: GRAPH_SCOPES.join(' '),
    state,
    prompt: 'consent',
  });
  return `${authority()}/authorize?${params.toString()}`;
}

export async function exchangeGraphCodeForTokens(code: string): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: requireEnv('ENTRA_CLIENT_ID'),
    client_secret: requireEnv('ENTRA_CLIENT_SECRET'),
    grant_type: 'authorization_code',
    code,
    redirect_uri: requireEnv('GRAPH_REDIRECT_URI'),
    scope: GRAPH_SCOPES.join(' '),
  });

  const res = await fetch(`${authority()}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph OAuth code exchange failed: ${res.status} ${text}`);
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

export async function refreshGraphAccessToken(refreshToken: string): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: requireEnv('ENTRA_CLIENT_ID'),
    client_secret: requireEnv('ENTRA_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES.join(' '),
  });

  const res = await fetch(`${authority()}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph token refresh failed: ${res.status} ${text}`);
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
