import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ENV_LOCAL = resolve(process.cwd(), '.env.local');
const ADMIN_EMAIL = 'you@example.com';

type Secret = {
  name: string;
  value: string;
  remote: boolean;
};

const secrets: Secret[] = [
  { name: 'AUTH_SECRET', value: randomBytes(32).toString('base64'), remote: true },
  { name: 'AUTH_TRUST_HOST', value: 'true', remote: true },
  { name: 'ENCRYPTION_KEY', value: randomBytes(32).toString('hex'), remote: true },
  { name: 'CRON_SECRET', value: randomBytes(32).toString('hex'), remote: true },
  { name: 'ADMIN_EMAIL_ALLOWLIST', value: ADMIN_EMAIL, remote: true },
];

function loadEnv(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(ENV_LOCAL)) return map;
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

function writeEnv(map: Map<string, string>) {
  const lines = ['# Created by Vercel CLI / local seeding'];
  for (const [k, v] of map) {
    lines.push(`${k}="${v}"`);
  }
  writeFileSync(ENV_LOCAL, lines.join('\n') + '\n', { mode: 0o600 });
}

function ensureRemote(name: string, value: string) {
  for (const env of ['production', 'preview', 'development'] as const) {
    try {
      execSync(`vercel env rm ${name} ${env} --yes`, { stdio: 'ignore' });
    } catch {
      // Not present — fine
    }
    try {
      execSync(`vercel env add ${name} ${env}`, {
        input: `${value}\n`,
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      console.log(`  ${env.padEnd(11)} ✓`);
    } catch (err) {
      console.error(`  ${env.padEnd(11)} ✗`, err instanceof Error ? err.message : err);
    }
  }
}

async function main() {
  const env = loadEnv();
  const created: string[] = [];
  const skipped: string[] = [];
  for (const s of secrets) {
    if (env.has(s.name) && env.get(s.name)) {
      skipped.push(s.name);
      continue;
    }
    env.set(s.name, s.value);
    created.push(s.name);
  }
  writeEnv(env);

  console.log('Created locally:', created.length ? created.join(', ') : '(none)');
  console.log('Already present, skipped local write:', skipped.length ? skipped.join(', ') : '(none)');

  console.log('\nPushing to Vercel (production + preview + development)...');
  for (const s of secrets) {
    if (!s.remote) continue;
    const finalValue = env.get(s.name) ?? s.value;
    console.log(`\n${s.name}:`);
    ensureRemote(s.name, finalValue);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
