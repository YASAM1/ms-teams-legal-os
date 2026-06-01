import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');
const sql = postgres(url, { max: 1 });

const TEMPLATE_TABLES = [
  'capability_runs',
  'capabilities',
  'audit_log',
  'agent_config',
  'clio_oauth',
  'conversations',
  'kb_documents',
];

async function main() {
  console.log('Dropping template tables in public schema...');
  for (const t of TEMPLATE_TABLES) {
    console.log(`  DROP TABLE IF EXISTS public."${t}" CASCADE`);
    await sql.unsafe(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
  }

  console.log('Dropping template enum types in public schema...');
  const enums = await sql<Array<{ typname: string }>>`
    SELECT t.typname FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typcategory = 'E'
  `;
  for (const e of enums) {
    console.log(`  DROP TYPE IF EXISTS public."${e.typname}" CASCADE`);
    await sql.unsafe(`DROP TYPE IF EXISTS public."${e.typname}" CASCADE`);
  }

  console.log('Resetting drizzle migration log...');
  await sql.unsafe(`DELETE FROM drizzle.__drizzle_migrations`);

  console.log('Done. Now run drizzle-kit migrate.');
}
main().finally(() => sql.end());
