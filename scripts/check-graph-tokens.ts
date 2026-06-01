import { db } from '@/db';

async function main() {
  const tokens = await db.query.graphTokens.findMany();
  console.log(`Graph tokens: ${tokens.length}`);
  for (const t of tokens) {
    console.log(`  userId=${t.userId.slice(0, 8)}…  expires=${t.expiresAt.toISOString()}  scope=${t.scope ?? '(none)'}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
