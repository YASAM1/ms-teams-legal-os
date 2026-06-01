import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  const path = join(process.cwd(), 'db/migrations/0001_enable_pgvector_and_embeddings.sql');
  const file = readFileSync(path, 'utf8');
  const statements = file
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    console.log('Applying:', stmt.split('\n')[0]);
    await sql.unsafe(stmt);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => sql.end());
