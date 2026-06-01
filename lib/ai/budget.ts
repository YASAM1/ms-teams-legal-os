import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';

/** Approximate per-million-token costs in cents. Used for budget tracking only;
 *  authoritative billing comes from Vercel AI Gateway. Update when prices move. */
const COST_PER_MTOK_CENTS: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-4-5': { input: 100, output: 500 },     // ~$1 / $5
  'anthropic/claude-sonnet-4-6': { input: 300, output: 1500 },   // ~$3 / $15
  'anthropic/claude-opus-4-7': { input: 1500, output: 7500 },    // ~$15 / $75
  'openai/text-embedding-3-small': { input: 2, output: 0 },      // ~$0.02 / M tokens
};

export type RecordUsageInput = {
  matterId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type BudgetState = {
  inputTokens: number;
  outputTokens: number;
  estimatedUsdCents: number;
  softLimitCents: number;
  hardLimitCents: number;
  softBreached: boolean;
  hardBreached: boolean;
};

function estimateCents(model: string, inputTokens: number, outputTokens: number): number {
  const c = COST_PER_MTOK_CENTS[model];
  if (!c) return 0;
  // cents = (tokens / 1_000_000) * cents_per_mtok, rounded up to keep budgets conservative.
  return Math.ceil((inputTokens * c.input + outputTokens * c.output) / 1_000_000);
}

export async function recordMatterUsage(input: RecordUsageInput): Promise<BudgetState> {
  const cost = estimateCents(input.model, input.inputTokens, input.outputTokens);
  const now = new Date();

  await db
    .insert(schema.matterTokenBudgets)
    .values({
      matterId: input.matterId,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedUsdCents: cost,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.matterTokenBudgets.matterId,
      set: {
        inputTokens: sql`${schema.matterTokenBudgets.inputTokens} + ${input.inputTokens}`,
        outputTokens: sql`${schema.matterTokenBudgets.outputTokens} + ${input.outputTokens}`,
        estimatedUsdCents: sql`${schema.matterTokenBudgets.estimatedUsdCents} + ${cost}`,
        updatedAt: now,
      },
    });

  const row = await db.query.matterTokenBudgets.findFirst({
    where: eq(schema.matterTokenBudgets.matterId, input.matterId),
  });
  if (!row) {
    // Shouldn't happen — we just inserted.
    throw new Error(`matter_token_budgets row missing after upsert for matter ${input.matterId}`);
  }

  const softBreached = row.estimatedUsdCents >= row.softLimitCents;
  const hardBreached = row.estimatedUsdCents >= row.hardLimitCents;

  if (hardBreached && !row.hardAlertedAt) {
    await db
      .update(schema.matterTokenBudgets)
      .set({ hardAlertedAt: now })
      .where(eq(schema.matterTokenBudgets.matterId, input.matterId));
    logger.error(
      {
        matterId: input.matterId,
        estimatedUsdCents: row.estimatedUsdCents,
        hardLimitCents: row.hardLimitCents,
      },
      'matter token budget: HARD limit breached',
    );
    await db.insert(schema.auditLog).values({
      tool: 'ai.budget.hard_breach',
      input: { matterId: input.matterId },
      metadata: {
        estimatedUsdCents: row.estimatedUsdCents,
        hardLimitCents: row.hardLimitCents,
      },
    });
  } else if (softBreached && !row.softAlertedAt) {
    await db
      .update(schema.matterTokenBudgets)
      .set({ softAlertedAt: now })
      .where(eq(schema.matterTokenBudgets.matterId, input.matterId));
    logger.warn(
      {
        matterId: input.matterId,
        estimatedUsdCents: row.estimatedUsdCents,
        softLimitCents: row.softLimitCents,
      },
      'matter token budget: soft limit breached',
    );
    await db.insert(schema.auditLog).values({
      tool: 'ai.budget.soft_breach',
      input: { matterId: input.matterId },
      metadata: {
        estimatedUsdCents: row.estimatedUsdCents,
        softLimitCents: row.softLimitCents,
      },
    });
  }

  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedUsdCents: row.estimatedUsdCents,
    softLimitCents: row.softLimitCents,
    hardLimitCents: row.hardLimitCents,
    softBreached,
    hardBreached,
  };
}

/** Check if a matter is over its hard limit. Callers can abort an expensive
 *  call (e.g. Opus drafting) when this returns true. */
export async function isOverHardLimit(matterId: string): Promise<boolean> {
  const row = await db.query.matterTokenBudgets.findFirst({
    where: eq(schema.matterTokenBudgets.matterId, matterId),
  });
  if (!row) return false;
  return row.estimatedUsdCents >= row.hardLimitCents;
}
