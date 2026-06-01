import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ENV_LOCAL = resolve(process.cwd(), '.env.local');

function loadEnv(): Map<string, string> {
  const map = new Map<string, string>();
  const text = readFileSync(ENV_LOCAL, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq);
    let v = trimmed.slice(eq + 1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    map.set(k, v);
  }
  return map;
}

const NAMES = ['ENTRA_CLIENT_ID', 'ENTRA_TENANT_ID', 'ENTRA_CLIENT_SECRET'];
const ENVS = ['production', 'development'] as const;

async function main() {
  const env = loadEnv();
  for (const name of NAMES) {
    const value = env.get(name);
    if (!value) {
      console.log(`${name}: missing locally, skipping`);
      continue;
    }
    console.log(`\n${name}:`);
    for (const target of ENVS) {
      try {
        execSync(`vercel env rm ${name} ${target} --yes`, { stdio: 'ignore' });
      } catch {}
      try {
        execSync(`vercel env add ${name} ${target}`, {
          input: `${value}\n`,
          stdio: ['pipe', 'ignore', 'ignore'],
        });
        console.log(`  ${target.padEnd(11)} ✓`);
      } catch (err) {
        console.error(`  ${target.padEnd(11)} ✗`, err instanceof Error ? err.message : err);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
