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
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', z.treeifyError(parsed.error));
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
