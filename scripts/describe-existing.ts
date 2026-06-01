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
    const cols = await sql<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=${t}
      ORDER BY ordinal_position
    `;
    console.log(`\n${t}:`);
    for (const c of cols) console.log(`  ${c.column_name} ${c.data_type}`);
  }
}
main().finally(() => sql.end());
