import { embed, embedMany, generateObject, generateText, gateway, type LanguageModel, type EmbeddingModel } from 'ai';

export type { LanguageModel, EmbeddingModel };

export const MODELS = {
  router: 'anthropic/claude-haiku-4-5',
  triage: 'anthropic/claude-sonnet-4-6',
  drafting: 'anthropic/claude-opus-4-7',
  scribe: 'anthropic/claude-sonnet-4-6',
  reporting: 'anthropic/claude-sonnet-4-6',
} as const;

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

export function lm(model: keyof typeof MODELS | string): LanguageModel {
  const id = (MODELS as Record<string, string>)[model] ?? model;
  return gateway(id);
}

export function embeddingModel(): EmbeddingModel {
  return gateway.textEmbeddingModel(EMBEDDING_MODEL);
}

export { embed, embedMany, generateObject, generateText };
