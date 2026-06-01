import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');
const sql = postgres(url, { max: 1 });

async function main() {
  const tables = [
    'agent_config',
    'audit_log',
    'capabilities',
    'capability_runs',
    'clio_oauth',
    'conversations',
    'kb_documents',
  ];
  for (const t of tables) {
    const rows = await sql.unsafe(`SELECT count(*)::int as n FROM public."${t}"`);
    console.log(`${t}: ${rows[0].n} rows`);
  }
}
main().finally(() => sql.end());
