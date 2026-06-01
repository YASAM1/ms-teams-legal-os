import { embedAllMatters } from '@/lib/clio/embeddings';

async function main() {
  console.log('Embedding all matters via openai/text-embedding-3-small...');
  const start = Date.now();
  const result = await embedAllMatters();
  console.log(`\nDone in ${Date.now() - start}ms`);
  console.log(`  Embedded: ${result.embedded}`);
  console.log(`  Skipped:  ${result.skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
