import { db, schema } from '@/db';

async function main() {
  const users = await db.query.users.findMany();
  console.log(`Users (${users.length}):`);
  for (const u of users) {
    console.log(`  • ${u.email} (id=${u.id.slice(0, 8)}…, role=${u.role}, entraOid=${u.entraOid.slice(0, 8)}…)`);
  }

  const tokens = await db.query.clioTokens.findMany();
  console.log(`\nClio tokens (${tokens.length}):`);
  for (const t of tokens) {
    console.log(
      `  • userId=${t.userId.slice(0, 8)}…  expires=${t.expiresAt.toISOString()}  scope=${t.scope ?? '(none)'}  accessTokenEnc length=${t.accessTokenEnc.length}`,
    );
  }

  const matters = await db.query.matters.findMany({ limit: 5 });
  console.log(`\nMatters in DB (showing up to 5): ${matters.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
