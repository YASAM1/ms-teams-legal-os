import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  type Activity,
  type TurnContext,
} from 'botbuilder';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export type BotHandler = (context: TurnContext) => Promise<void>;

let cachedAdapter: CloudAdapter | null = null;

function getAdapter(): CloudAdapter {
  if (cachedAdapter) return cachedAdapter;

  const e = env();
  if (!e.BOT_APP_ID || !e.BOT_APP_PASSWORD) {
    throw new Error(
      'Bot credentials missing: set BOT_APP_ID and BOT_APP_PASSWORD before serving Teams traffic',
    );
  }

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: e.BOT_APP_ID,
    MicrosoftAppPassword: e.BOT_APP_PASSWORD,
    MicrosoftAppType: e.BOT_APP_TYPE,
    MicrosoftAppTenantId: e.BOT_APP_TENANT_ID ?? '',
  });

  const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(
    null,
    credentialsFactory,
  );

  const adapter = new CloudAdapter(botFrameworkAuth);

  adapter.onTurnError = async (context: TurnContext, error: Error) => {
    logger.error({ err: error, activityType: context.activity?.type }, 'bot turn error');
    try {
      await context.sendActivity('Something went wrong on my end. The error has been logged.');
    } catch (sendError) {
      logger.error({ err: sendError }, 'failed to send turn error message');
    }
  };

  cachedAdapter = adapter;
  return adapter;
}

export async function processActivity(
  authHeader: string,
  activity: Activity,
  handler: BotHandler,
) {
  await getAdapter().processActivityDirect(authHeader, activity, handler);
}

export function getAdapterForProactive(): CloudAdapter {
  return getAdapter();
}
