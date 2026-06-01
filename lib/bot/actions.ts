import type { TurnContext } from 'botbuilder';
import { logger } from '@/lib/logger';

/**
 * Action.Submit handlers. Adaptive Card actions arrive as Message activities
 * with the action payload in `activity.value`. We route by `data.kind`.
 *
 * Each handler should return a user-facing message string OR send activities
 * itself for richer UIs (cards, files). Returning a string is the common case.
 */

export type ActionHandler = (
  context: TurnContext,
  payload: Record<string, unknown>,
  userId: string,
) => Promise<string | void>;

const handlers = new Map<string, ActionHandler>();

export function registerAction(kind: string, handler: ActionHandler): void {
  handlers.set(kind, handler);
}

export async function dispatchCardAction(
  context: TurnContext,
  payload: Record<string, unknown>,
  userId: string,
): Promise<{ handled: boolean; reply?: string }> {
  const kind = typeof payload.kind === 'string' ? payload.kind : null;
  if (!kind) return { handled: false };

  const handler = handlers.get(kind);
  if (!handler) {
    logger.warn({ kind }, 'no handler registered for card action');
    return { handled: true, reply: `Unknown action: ${kind}` };
  }

  try {
    const reply = await handler(context, payload, userId);
    return { handled: true, reply: typeof reply === 'string' ? reply : undefined };
  } catch (err) {
    logger.error({ err, kind }, 'card action handler failed');
    return {
      handled: true,
      reply: `Action failed — ${err instanceof Error ? err.message : 'unknown error'}.`,
    };
  }
}

/** Register baseline handlers so a stale card click gets a friendly response. */
registerAction('noop', async () => '👍');
