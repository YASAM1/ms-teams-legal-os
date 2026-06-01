import { syncAllUsersWithClioTokens } from '@/lib/clio/sync';

async function main() {
  console.log('Starting Clio sync for all users with stored tokens...');
  const results = await syncAllUsersWithClioTokens();
  console.log('\nResults:');
  for (const r of results) {
    console.log(`  clients=${r.clientsUpserted}  matters=${r.mattersUpserted}  errors=${r.errors.length}`);
    for (const err of r.errors) console.log(`    ✗ ${err}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
