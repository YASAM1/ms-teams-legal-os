import { findMatter, CONFIDENCE } from '@/lib/clio/find-matter';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: tsx scripts/smoke-find-matter.ts "<query>"');
    process.exit(1);
  }

  console.log(`Query: "${query}"\n`);
  const start = Date.now();
  const resolution = await findMatter(query);
  console.log(`Decision: ${resolution.decision}`);
  console.log(`Total candidates: ${resolution.candidates.length}`);
  console.log(`Latency: ${Date.now() - start}ms\n`);

  for (const [i, c] of resolution.candidates.slice(0, 5).entries()) {
    const pct = Math.round(c.finalConfidence * 100);
    const flag =
      c.finalConfidence >= CONFIDENCE.AUTO_ATTACH
        ? '✅'
        : c.finalConfidence >= CONFIDENCE.HITL_CONFIRM
          ? '🟡'
          : '⚠️';
    console.log(`${i + 1}. ${flag} [${pct}%] ${c.displayName} — ${c.clientName ?? 'no client'}`);
    console.log(`   hybrid=${c.hybridScore.toFixed(3)}  llm=${c.llmRelevance.toFixed(3)}`);
    console.log(`   ${c.llmReasoning}`);
    console.log('');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
