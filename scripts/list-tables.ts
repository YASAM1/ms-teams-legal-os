import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');

const sql = postgres(url, { max: 1 });

async function main() {
  const tables = await sql<Array<{ schemaname: string; tablename: string }>>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, tablename;
  `;

  const journal = await sql<Array<{ hash: string; created_at: bigint }>>`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
  `.catch(() => []);

  console.log('Tables:');
  for (const t of tables) console.log(`  ${t.schemaname}.${t.tablename}`);
  console.log('\nDrizzle migrations applied:');
  for (const m of journal) console.log(`  ${m.hash} at ${m.created_at}`);
}

main().finally(() => sql.end());
