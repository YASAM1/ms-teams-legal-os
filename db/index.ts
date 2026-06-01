import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: PostgresJsDatabase<typeof schema>;
};

function getClient() {
  if (globalForDb.pgClient) return globalForDb.pgClient;
  const client = postgres(requireEnv('DATABASE_URL'), {
    max: 5,
    idle_timeout: 20,
    prepare: false,
  });
  if (process.env.NODE_ENV !== 'production') globalForDb.pgClient = client;
  return client;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    if (!globalForDb.drizzleDb) {
      globalForDb.drizzleDb = drizzle(getClient(), { schema });
    }
    return Reflect.get(globalForDb.drizzleDb, prop);
  },
});

export { schema };
