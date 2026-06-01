import 'dotenv/config';
import {
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  CloudAdapter,
} from 'botbuilder';
import { env } from '@/lib/env';

async function main() {
  const e = env();
  console.log('BOT_APP_ID:        ', e.BOT_APP_ID ? `${e.BOT_APP_ID.slice(0, 8)}…` : '(missing)');
  console.log('BOT_APP_PASSWORD:  ', e.BOT_APP_PASSWORD ? '(set)' : '(missing)');
  console.log('BOT_APP_TYPE:      ', e.BOT_APP_TYPE ?? '(missing)');
  console.log('BOT_APP_TENANT_ID: ', e.BOT_APP_TENANT_ID ?? '(missing)');

  if (!e.BOT_APP_ID || !e.BOT_APP_PASSWORD) {
    console.error('\nERROR: Bot credentials missing.');
    process.exit(1);
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

  console.log('\n✓ CloudAdapter constructed:', adapter.constructor.name);

  const isValid = await credentialsFactory.isValidAppId(e.BOT_APP_ID);
  console.log('✓ isValidAppId(BOT_APP_ID):', isValid);

  const isAuthDisabled = await credentialsFactory.isAuthenticationDisabled();
  console.log('✓ isAuthenticationDisabled():', isAuthDisabled, '(should be false in prod)');

  console.log('\nAdapter is ready to serve Teams traffic. Live token issuance happens');
  console.log('when Teams sends the first message — verify end-to-end after deploy.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
