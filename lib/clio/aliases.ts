import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';

export async function recordPositiveAlias(matterId: string, alias: string): Promise<void> {
  const normalized = alias.trim();
  if (!normalized) return;
  await db.insert(schema.matterAliases).values({
    matterId,
    alias: normalized,
    source: 'learned_positive',
  });
}

export async function recordNegativeAlias(matterId: string, alias: string): Promise<void> {
  const normalized = alias.trim();
  if (!normalized) return;
  await db.insert(schema.matterAliases).values({
    matterId,
    alias: normalized,
    source: 'learned_negative',
  });
}

export async function loadNegativeAliasesForQuery(query: string): Promise<Set<string>> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return new Set();
  const rows = await db
    .select({ matterId: schema.matterAliases.matterId })
    .from(schema.matterAliases)
    .where(
      and(
        eq(schema.matterAliases.source, 'learned_negative'),
        sql`lower(${schema.matterAliases.alias}) = ${normalized}`,
      ),
    );
  return new Set(rows.map((r) => r.matterId));
}
