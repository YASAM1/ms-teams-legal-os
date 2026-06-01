import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql`ALTER TABLE graph_tokens ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz`;
  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'graph_tokens' ORDER BY ordinal_position
  `;
  console.log('graph_tokens columns:', rows.map((r) => r.column_name).join(', '));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
