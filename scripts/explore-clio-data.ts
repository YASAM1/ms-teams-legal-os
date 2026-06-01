import { db, schema } from '@/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('━━━ CLIENTS ━━━\n');
  const clientCount = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM clients`);
  console.log(`Total clients: ${clientCount[0].n}\n`);

  const sampleClients = await db
    .select({ name: schema.clients.name, email: schema.clients.primaryEmail })
    .from(schema.clients)
    .orderBy(sql`random()`)
    .limit(10);
  console.log('Random sample of 10 clients:');
  for (const c of sampleClients) {
    console.log(`  • ${c.name}${c.email ? ` <${c.email}>` : ''}`);
  }

  console.log('\n\n━━━ MATTERS ━━━\n');
  const matterCount = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM matters`);
  console.log(`Total matters: ${matterCount[0].n}\n`);

  const statusBreakdown = await db.execute<{ status: string; n: number }>(
    sql`SELECT status, count(*)::int AS n FROM matters GROUP BY status ORDER BY n DESC`,
  );
  console.log('Status breakdown:');
  for (const s of statusBreakdown) {
    console.log(`  ${s.status?.padEnd(15) ?? '(null)'.padEnd(15)} ${s.n}`);
  }

  console.log('\n\n━━━ DESCRIPTION KEYWORDS ━━━\n');
  // Pull all descriptions, count word frequencies (rough)
  const matters = await db.execute<{ display_name: string; description: string | null; client_name: string | null }>(
    sql`SELECT m.display_name, m.description, c.name AS client_name
        FROM matters m LEFT JOIN clients c ON c.id = m.client_id
        ORDER BY m.created_at DESC`,
  );

  // Count words across descriptions (skip common stopwords)
  const stop = new Set([
    'the','a','an','and','or','of','for','to','in','on','at','by','with','from','re','case','matter','vs','v',
    'is','are','was','were','be','been','as','that','this','his','her','their','our','my','your',
    '&','/','—','-','&',
  ]);
  const wordFreq = new Map<string, number>();
  for (const m of matters) {
    const text = `${m.display_name ?? ''} ${m.description ?? ''}`.toLowerCase();
    for (const w of text.split(/[^a-z0-9]+/)) {
      if (w.length < 3) continue;
      if (stop.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
    }
  }
  const topWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  console.log('Top 30 keywords in matter names + descriptions:');
  for (const [w, n] of topWords) {
    console.log(`  ${w.padEnd(20)} ${n}`);
  }

  console.log('\n\n━━━ CUSTOM FIELDS ━━━\n');
  const customFieldUsage = await db.execute<{ field_name: string; n: number; sample_values: string }>(
    sql`WITH kv AS (
          SELECT key AS field_name, value::text AS value_text
          FROM matters m, LATERAL jsonb_each(m.custom_fields)
          WHERE m.custom_fields IS NOT NULL AND m.custom_fields::text <> '{}'
        )
        SELECT field_name, count(*)::int AS n, string_agg(DISTINCT value_text, ' | ') AS sample_values
        FROM kv
        GROUP BY field_name
        ORDER BY n DESC
        LIMIT 15`,
  );
  console.log('Most common custom fields (with sample values):');
  for (const cf of customFieldUsage) {
    const samples = String(cf.sample_values ?? '').slice(0, 100);
    console.log(`  ${cf.field_name.padEnd(25)} (${cf.n}x)  e.g. ${samples}`);
  }

  console.log('\n\n━━━ SAMPLE FULL MATTERS ━━━\n');
  const fullSample = await db.execute<{
    display_name: string;
    description: string | null;
    client_name: string | null;
    status: string | null;
    custom_fields: Record<string, unknown>;
  }>(
    sql`SELECT m.display_name, m.description, c.name AS client_name, m.status, m.custom_fields
        FROM matters m LEFT JOIN clients c ON c.id = m.client_id
        ORDER BY random()
        LIMIT 8`,
  );
  for (const m of fullSample) {
    console.log(`\n  ${m.display_name} (${m.status ?? '?'})`);
    console.log(`    client: ${m.client_name ?? '(none)'}`);
    if (m.description) console.log(`    desc:   ${m.description.slice(0, 200)}${m.description.length > 200 ? '…' : ''}`);
    const cf = m.custom_fields;
    if (cf && Object.keys(cf).length > 0) {
      console.log(`    fields: ${JSON.stringify(cf).slice(0, 200)}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
