-- Enable pgvector extension and add embeddings table for matter semantic search.
-- This migration is hand-written and runs after the Drizzle-generated schema migration.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS matter_embeddings (
  matter_id uuid PRIMARY KEY REFERENCES matters(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  source_text text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matter_embeddings_cosine_idx
  ON matter_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
