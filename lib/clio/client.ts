import { requireEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { acquireToken } from '@/lib/rate-limit';
import { loadClioTokens, saveClioTokens, type ClioTokenSet } from './tokens';

const CLIO_API_BASE = 'https://app.clio.com/api/v4';
const CLIO_OAUTH_BASE = 'https://app.clio.com/oauth';
const REFRESH_LEEWAY_MS = 60_000;

export class ClioApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `Clio API error ${status}`);
    this.name = 'ClioApiError';
  }
}

async function refreshAccessToken(refreshToken: string): Promise<ClioTokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: requireEnv('CLIO_CLIENT_ID'),
    client_secret: requireEnv('CLIO_CLIENT_SECRET'),
  });

  const res = await fetch(`${CLIO_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ClioApiError(res.status, text, 'Clio token refresh failed');
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

async function getValidTokens(userId: string): Promise<ClioTokenSet> {
  const tokens = await loadClioTokens(userId);
  if (!tokens) {
    throw new Error(`No Clio tokens stored for user ${userId}`);
  }
  if (tokens.expiresAt.getTime() - Date.now() > REFRESH_LEEWAY_MS) {
    return tokens;
  }
  logger.debug({ userId }, 'refreshing Clio access token');
  const fresh = await refreshAccessToken(tokens.refreshToken);
  await saveClioTokens(userId, fresh);
  return fresh;
}

export type ClioFetchInit = Omit<RequestInit, 'body'> & {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export async function clioFetch<T>(
  userId: string,
  path: string,
  init: ClioFetchInit = {},
): Promise<T> {
  await acquireToken(`clio:${userId}`, { capacity: 20, refillPerSecond: 5 });

  const tokens = await getValidTokens(userId);
  const url = new URL(`${CLIO_API_BASE}${path}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${tokens.accessToken}`);
  headers.set('accept', 'application/json');
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const res = await fetch(url, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 5);
    logger.warn({ userId, path, retryAfter }, 'Clio rate-limited, retrying');
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return clioFetch<T>(userId, path, init);
  }

  if (res.status === 401) {
    logger.warn({ userId, path }, 'Clio returned 401 — token may have been revoked');
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ClioApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ClioPaged<T> = {
  data: T[];
  meta: {
    paging?: {
      next?: string;
      previous?: string;
    };
    records: number;
  };
};

export async function* clioPaginate<T>(
  userId: string,
  path: string,
  init: ClioFetchInit = {},
): AsyncGenerator<T, void, unknown> {
  let currentUrl: string | null = null;
  while (true) {
    const page: ClioPaged<T> = currentUrl
      ? await clioFetch<ClioPaged<T>>(userId, currentUrl.replace(CLIO_API_BASE, ''))
      : await clioFetch<ClioPaged<T>>(userId, path, init);

    for (const item of page.data) yield item;

    const next: string | undefined = page.meta.paging?.next;
    if (!next) return;
    currentUrl = next;
  }
}
