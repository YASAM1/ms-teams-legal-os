import { requireEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { acquireToken } from '@/lib/rate-limit';
import { loadGraphTokens, saveGraphTokens, type GraphTokenSet } from './tokens';
import { refreshGraphAccessToken } from './oauth';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const REFRESH_LEEWAY_MS = 60_000;

export class GraphApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `Graph API error ${status}`);
    this.name = 'GraphApiError';
  }
}

async function getValidTokens(userId: string): Promise<GraphTokenSet> {
  const tokens = await loadGraphTokens(userId);
  if (!tokens) {
    throw new Error(`No Graph tokens stored for user ${userId}`);
  }
  if (tokens.expiresAt.getTime() - Date.now() > REFRESH_LEEWAY_MS) {
    return tokens;
  }
  logger.debug({ userId }, 'refreshing Graph access token');
  const fresh = await refreshGraphAccessToken(tokens.refreshToken);
  await saveGraphTokens(userId, fresh);
  return fresh;
}

export type GraphFetchInit = Omit<RequestInit, 'body'> & {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

export async function graphFetch<T>(
  userId: string,
  path: string,
  init: GraphFetchInit = {},
): Promise<T> {
  // Microsoft Graph delegated calls: 10,000 requests / 10 min per app per mailbox.
  // Per-user token bucket: 50 burst, 10/s sustained — generous but stops runaway loops.
  await acquireToken(`graph:${userId}`, { capacity: 50, refillPerSecond: 10 });

  const tokens = await getValidTokens(userId);
  const url = new URL(path.startsWith('http') ? path : `${GRAPH_API_BASE}${path}`);
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
    logger.warn({ userId, path, retryAfter }, 'Graph rate-limited, retrying');
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return graphFetch<T>(userId, path, init);
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new GraphApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type GraphPaged<T> = {
  value: T[];
  '@odata.nextLink'?: string;
};

export async function* graphPaginate<T>(
  userId: string,
  path: string,
  init: GraphFetchInit = {},
): AsyncGenerator<T, void, unknown> {
  let currentPath: string | null = null;
  while (true) {
    const page: GraphPaged<T> = currentPath
      ? await graphFetch<GraphPaged<T>>(userId, currentPath)
      : await graphFetch<GraphPaged<T>>(userId, path, init);

    for (const item of page.value) yield item;

    const next = page['@odata.nextLink'];
    if (!next) return;
    currentPath = next;
  }
}

export function graphApiBase(): string {
  return GRAPH_API_BASE;
}

export function webhookNotificationUrl(): string {
  const base = requireEnv('GRAPH_REDIRECT_URI').replace(/\/api\/graph\/oauth\/callback$/, '');
  return `${base}/api/graph/webhooks`;
}
