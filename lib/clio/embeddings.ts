import { eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { embedMany } from 'ai';
import { embeddingModel, EMBEDDING_MODEL } from '@/lib/ai/gateway';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 50;

type MatterRow = typeof schema.matters.$inferSelect;

function matterToText(matter: MatterRow, clientName: string | null): string {
  const parts = [
    matter.displayName,
    clientName ?? '',
    matter.description ?? '',
    Object.entries(matter.customFields ?? {})
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', '),
  ].filter(Boolean);
  return parts.join(' — ');
}

export async function embedAllMatters(options: { onlyStale?: boolean } = {}): Promise<{
  embedded: number;
  skipped: number;
}> {
  let totalEmbedded = 0;
  let totalSkipped = 0;
  let offset = 0;

  while (true) {
    const rows = await db
      .select({
        matter: schema.matters,
        clientName: schema.clients.name,
        existingEmbeddingUpdatedAt: sql<Date | null>`me.updated_at`.as('me_updated_at'),
      })
      .from(schema.matters)
      .leftJoin(schema.clients, eq(schema.matters.clientId, schema.clients.id))
      .leftJoin(
        sql`matter_embeddings me`,
        sql`me.matter_id = ${schema.matters.id}`,
      )
      .where(
        options.onlyStale
          ? sql`me.matter_id IS NULL OR me.updated_at < ${schema.matters.updatedAt}`
          : sql`true`,
      )
      .limit(BATCH_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    const texts = rows.map((r) => matterToText(r.matter, r.clientName));
    const { embeddings } = await embedMany({ model: embeddingModel(), values: texts });

    for (let i = 0; i < rows.length; i++) {
      const matter = rows[i].matter;
      const text = texts[i];
      const vector = embeddings[i];
      const vectorLiteral = `[${vector.join(',')}]`;

      await db.execute(sql`
        INSERT INTO matter_embeddings (matter_id, embedding, source_text, model, created_at, updated_at)
        VALUES (${matter.id}, ${vectorLiteral}::vector, ${text}, ${EMBEDDING_MODEL}, now(), now())
        ON CONFLICT (matter_id)
        DO UPDATE SET embedding = EXCLUDED.embedding,
                      source_text = EXCLUDED.source_text,
                      model = EXCLUDED.model,
                      updated_at = now()
      `);
      totalEmbedded += 1;
    }

    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  logger.info({ totalEmbedded, totalSkipped }, 'matter embeddings updated');
  return { embedded: totalEmbedded, skipped: totalSkipped };
}
