import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entraOid: text('entra_oid').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: text('role', { enum: ['admin', 'attorney', 'paralegal', 'readonly'] })
      .notNull()
      .default('attorney'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_entra_oid_unique').on(t.entraOid), uniqueIndex('users_email_unique').on(t.email)],
);

export const clioTokens = pgTable(
  'clio_tokens',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const graphTokens = pgTable(
  'graph_tokens',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    scope: text('scope'),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clioId: text('clio_id').notNull(),
    name: text('name').notNull(),
    primaryEmail: text('primary_email'),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('clients_clio_id_unique').on(t.clioId),
    index('clients_name_idx').on(t.name),
  ],
);

export const matters = pgTable(
  'matters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clioId: text('clio_id').notNull(),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    description: text('description'),
    status: text('status'),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matters_clio_id_unique').on(t.clioId),
    index('matters_display_name_idx').on(t.displayName),
  ],
);

// Embedding column added in a follow-up migration so we can enable the pgvector extension first.
// See db/migrations/0001_matter_embeddings.sql.

export const matterAliases = pgTable(
  'matter_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
    source: text('source', { enum: ['imported', 'learned_positive', 'learned_negative'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('matter_aliases_alias_idx').on(t.alias)],
);

export const emailSummaries = pgTable(
  'email_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    graphMessageId: text('graph_message_id').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    matterId: uuid('matter_id').references(() => matters.id, { onDelete: 'set null' }),
    matterConfidence: integer('matter_confidence'),
    importance: text('importance', { enum: ['urgent', 'actionable', 'informational', 'noise'] }).notNull(),
    summary: text('summary').notNull(),
    actionItems: jsonb('action_items').$type<string[]>().notNull().default([]),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('email_summaries_msg_user_unique').on(t.graphMessageId, t.userId),
    index('email_summaries_user_received_idx').on(t.userId, t.receivedAt),
  ],
);

export const draftProposals = pgTable(
  'draft_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['email', 'clio_note', 'clio_billing', 'doc_extract'] }).notNull(),
    matterId: uuid('matter_id').references(() => matters.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'executed', 'failed'] })
      .notNull()
      .default('pending'),
    statusReason: text('status_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
  },
  (t) => [
    index('draft_proposals_user_status_idx').on(t.userId, t.status),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    agent: text('agent'),
    model: text('model'),
    tool: text('tool'),
    inputHash: text('input_hash'),
    outputHash: text('output_hash'),
    input: jsonb('input'),
    output: jsonb('output'),
    approved: boolean('approved'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_user_created_idx').on(t.userId, t.createdAt),
    index('audit_log_tool_idx').on(t.tool),
  ],
);

export const agentConfigs = pgTable(
  'agent_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentName: text('agent_name').notNull(),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    model: text('model').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('agent_configs_name_version_unique').on(t.agentName, t.version),
    index('agent_configs_active_idx').on(t.agentName, t.active),
  ],
);

export const conversationReferences = pgTable(
  'conversation_references',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    reference: jsonb('reference').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const matterTokenBudgets = pgTable(
  'matter_token_budgets',
  {
    matterId: uuid('matter_id')
      .primaryKey()
      .references(() => matters.id, { onDelete: 'cascade' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    estimatedUsdCents: integer('estimated_usd_cents').notNull().default(0),
    softLimitCents: integer('soft_limit_cents').notNull().default(2000),  // $20
    hardLimitCents: integer('hard_limit_cents').notNull().default(10000), // $100
    softAlertedAt: timestamp('soft_alerted_at', { withTimezone: true }),
    hardAlertedAt: timestamp('hard_alerted_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const graphSubscriptions = pgTable(
  'graph_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    resource: text('resource').notNull(),
    changeType: text('change_type').notNull(),
    clientState: text('client_state').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('graph_subs_expires_idx').on(t.expiresAt)],
);
