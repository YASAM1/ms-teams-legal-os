import { generateText } from 'ai';
import { lm, MODELS } from '@/lib/ai/gateway';

async function main() {
  const tests: Array<keyof typeof MODELS> = ['router', 'triage', 'drafting'];
  for (const role of tests) {
    const start = Date.now();
    try {
      const { text, usage } = await generateText({
        model: lm(role),
        prompt: 'Say "ok" in one word.',
        maxOutputTokens: 12,
      });
      console.log(
        `✓ ${role.padEnd(8)} (${MODELS[role]}) → "${text.trim().slice(0, 40)}" ` +
          `[${Date.now() - start}ms, in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'}]`,
      );
    } catch (err) {
      console.error(`✗ ${role.padEnd(8)} (${MODELS[role]}) failed:`, err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
