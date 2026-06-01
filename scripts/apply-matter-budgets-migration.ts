import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const file = resolve(process.cwd(), 'db/migrations/0003_matter_token_budgets.sql');
  const text = readFileSync(file, 'utf8');

  // Run statement-by-statement, splitting on top-level semicolons. The DO $$ block
  // is preserved because we split smartly using a sentinel for the dollar-quoted body.
  const statements = splitSqlStatements(text);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    console.log(`> ${trimmed.slice(0, 80).replace(/\s+/g, ' ')}…`);
    await sql.unsafe(trimmed);
  }

  const rows = await sql<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'matter_token_budgets' ORDER BY ordinal_position
  `;
  console.log('matter_token_budgets columns:', rows.map((r) => r.column_name).join(', '));
  await sql.end();
}

function splitSqlStatements(input: string): string[] {
  const out: string[] = [];
  let buf = '';
  let dollarDepth = 0;
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '$' && input[i + 1] === '$') {
      dollarDepth = dollarDepth === 0 ? 1 : 0;
      buf += '$$';
      i += 2;
      continue;
    }
    if (c === ';' && dollarDepth === 0) {
      out.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
