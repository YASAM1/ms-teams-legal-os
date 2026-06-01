import { sql } from 'drizzle-orm';
import { embed } from 'ai';
import { db } from '@/db';
import { embeddingModel } from '@/lib/ai/gateway';

export type MatterSearchCandidate = {
  matterId: string;
  clioId: string;
  displayName: string;
  clientName: string | null;
  description: string | null;
  bm25Score: number;
  cosineSimilarity: number;
  aliasMatch: boolean;
  hybridScore: number;
};

const BM25_WEIGHT = 0.4;
const COSINE_WEIGHT = 0.5;
const ALIAS_BOOST = 0.1;

export async function searchMatters(
  query: string,
  options: { limit?: number; learnedNegatives?: Set<string> } = {},
): Promise<MatterSearchCandidate[]> {
  const limit = options.limit ?? 10;
  if (!query.trim()) return [];

  const { embedding } = await embed({ model: embeddingModel(), value: query });
  const vectorLiteral = `[${embedding.join(',')}]`;

  const rows = await db.execute<{
    matter_id: string;
    clio_id: string;
    display_name: string;
    client_name: string | null;
    description: string | null;
    bm25_score: number;
    cosine_similarity: number;
    alias_match: number;
  }>(sql`
    WITH q AS (
      SELECT
        plainto_tsquery('english', ${query}) AS tsq,
        ${vectorLiteral}::vector AS qvec,
        lower(${query}) AS qtext
    )
    SELECT
      m.id AS matter_id,
      m.clio_id,
      m.display_name,
      c.name AS client_name,
      m.description,
      coalesce(
        ts_rank_cd(
          to_tsvector('english',
            coalesce(m.display_name, '') || ' ' ||
            coalesce(m.description, '') || ' ' ||
            coalesce(c.name, '')
          ),
          q.tsq
        ),
        0
      )::float8 AS bm25_score,
      coalesce(1 - (me.embedding <=> q.qvec), 0)::float8 AS cosine_similarity,
      coalesce(
        (SELECT 1 FROM matter_aliases ma WHERE ma.matter_id = m.id
           AND lower(ma.alias) = q.qtext AND ma.source <> 'learned_negative' LIMIT 1),
        0
      )::int AS alias_match
    FROM matters m
    LEFT JOIN clients c ON c.id = m.client_id
    LEFT JOIN matter_embeddings me ON me.matter_id = m.id
    CROSS JOIN q
    WHERE
      to_tsvector('english',
        coalesce(m.display_name, '') || ' ' ||
        coalesce(m.description, '') || ' ' ||
        coalesce(c.name, '')
      ) @@ q.tsq
      OR me.embedding IS NOT NULL
    ORDER BY (
      ${BM25_WEIGHT}::float8 * coalesce(ts_rank_cd(
        to_tsvector('english',
          coalesce(m.display_name, '') || ' ' ||
          coalesce(m.description, '') || ' ' ||
          coalesce(c.name, '')
        ),
        q.tsq
      ), 0)
      + ${COSINE_WEIGHT}::float8 * coalesce(1 - (me.embedding <=> q.qvec), 0)
      + ${ALIAS_BOOST}::float8 * coalesce(
          (SELECT 1 FROM matter_aliases ma WHERE ma.matter_id = m.id
             AND lower(ma.alias) = q.qtext AND ma.source <> 'learned_negative' LIMIT 1),
          0
        )::int
    ) DESC
    LIMIT ${limit * 2}
  `);

  const negatives = options.learnedNegatives ?? new Set<string>();

  return (rows as unknown as Array<{
    matter_id: string;
    clio_id: string;
    display_name: string;
    client_name: string | null;
    description: string | null;
    bm25_score: number;
    cosine_similarity: number;
    alias_match: number;
  }>)
    .filter((r) => !negatives.has(r.matter_id))
    .slice(0, limit)
    .map((r) => ({
      matterId: r.matter_id,
      clioId: r.clio_id,
      displayName: r.display_name,
      clientName: r.client_name,
      description: r.description,
      bm25Score: Number(r.bm25_score),
      cosineSimilarity: Number(r.cosine_similarity),
      aliasMatch: r.alias_match === 1,
      hybridScore:
        BM25_WEIGHT * Number(r.bm25_score) +
        COSINE_WEIGHT * Number(r.cosine_similarity) +
        (r.alias_match === 1 ? ALIAS_BOOST : 0),
    }));
}
