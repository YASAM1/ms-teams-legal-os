import 'dotenv/config';
import {
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  CloudAdapter,
} from 'botbuilder';

// This smoke test runs at SETUP step 7 — BEFORE Clio, Langfuse, AI Gateway, etc.
// are configured. It deliberately reads ONLY the BOT_APP_* vars it needs, instead
// of the global env() validator, so an unrelated/unset credential elsewhere can't
// fail a test that's purely about the Bot Framework adapter.
const BOT_APP_ID = process.env.BOT_APP_ID?.trim() || undefined;
const BOT_APP_PASSWORD = process.env.BOT_APP_PASSWORD?.trim() || undefined;
const BOT_APP_TYPE = process.env.BOT_APP_TYPE?.trim() || 'SingleTenant';
const BOT_APP_TENANT_ID = process.env.BOT_APP_TENANT_ID?.trim() || undefined;

async function main() {
  console.log('BOT_APP_ID:        ', BOT_APP_ID ? `${BOT_APP_ID.slice(0, 8)}…` : '(missing)');
  console.log('BOT_APP_PASSWORD:  ', BOT_APP_PASSWORD ? '(set)' : '(missing)');
  console.log('BOT_APP_TYPE:      ', BOT_APP_TYPE);
  console.log('BOT_APP_TENANT_ID: ', BOT_APP_TENANT_ID ?? '(missing)');

  if (!BOT_APP_ID || !BOT_APP_PASSWORD) {
    console.error(
      '\nERROR: Bot credentials missing. Set BOT_APP_ID and BOT_APP_PASSWORD in' +
        ' .env.local (SETUP §7) before running this smoke test.',
    );
    process.exit(1);
  }

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: BOT_APP_ID,
    MicrosoftAppPassword: BOT_APP_PASSWORD,
    MicrosoftAppType: BOT_APP_TYPE,
    MicrosoftAppTenantId: BOT_APP_TENANT_ID ?? '',
  });

  const botFrameworkAuth = createBotFrameworkAuthenticationFromConfiguration(
    null,
    credentialsFactory,
  );
  const adapter = new CloudAdapter(botFrameworkAuth);

  console.log('\n✓ CloudAdapter constructed:', adapter.constructor.name);

  const isValid = await credentialsFactory.isValidAppId(BOT_APP_ID);
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
