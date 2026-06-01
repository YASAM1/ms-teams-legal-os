import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1).optional(),

  BOT_APP_ID: z.string().min(1).optional(),
  BOT_APP_PASSWORD: z.string().min(1).optional(),
  BOT_APP_TYPE: z.enum(['MultiTenant', 'SingleTenant', 'UserAssignedMSI']).default('SingleTenant'),
  BOT_APP_TENANT_ID: z.string().min(1).optional(),

  ENTRA_TENANT_ID: z.string().min(1).optional(),
  ENTRA_CLIENT_ID: z.string().min(1).optional(),
  ENTRA_CLIENT_SECRET: z.string().min(1).optional(),
  GRAPH_REDIRECT_URI: z.string().url().optional(),

  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),

  CLIO_CLIENT_ID: z.string().min(1).optional(),
  CLIO_CLIENT_SECRET: z.string().min(1).optional(),
  CLIO_REDIRECT_URI: z.string().url().optional(),
  CLIO_WEBHOOK_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),

  ENCRYPTION_KEY: z.string().min(32).optional(),

  AI_GATEWAY_API_KEY: z.string().min(1).optional(),

  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // The .env.example template ships optional keys as empty strings (e.g. `CLIO_CLIENT_ID=`).
  // After `cp .env.example .env.local` those arrive as "" — which is NOT undefined, so a bare
  // `.optional()` still runs `.min(1)`/`.url()` and fails before the feature is even configured.
  // Treat any empty-string env var as "unset" so optional features validate cleanly until you fill them in.
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    console.error(
      `Invalid environment variables in your .env.local:\n${lines.join('\n')}\n` +
        `Fix the keys listed above (see .env.example / SETUP.md for the expected format).`,
    );
    throw new Error('Invalid environment variables');
  }
  cached = parsed.data;
  return cached;
}

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value as NonNullable<Env[K]>;
}
