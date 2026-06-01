# Teams Legal OS — Task List (V1 Pilot)

**PRD:** `CURRENT_PRD.md`
**Status legend:** ⬜ todo · 🟡 in progress · ✅ done · 🚫 blocked
**Last updated:** 2026-05-20

Tasks are grouped by phase. Build phases run sequentially; tasks within a phase can parallelize unless dependencies are noted.

---

## Phase 0 — Discovery & Access (Week 1)

External coordination, no code. Blockers if not resolved.

- ⬜ **0.1** Confirm Azure / Entra ID admin access path with firm IT
- ⬜ **0.2** Confirm Clio Manage Elite admin access; capture API key + OAuth app credentials
- ⬜ **0.3** Confirm OneDrive folder structure convention for matters (`/Clients/<Last Name, First>/<Matter>/`)
- ⬜ **0.4** Get pilot attorney to provide 30 labeled email examples (15 important / 15 noise)
- ⬜ **0.5** Get pilot attorney to provide 20 sample financial documents (paystubs, W-2s, bank statements)
- ⬜ **0.6** Document current intake / triage SOP from attorney for replication
- ⬜ **0.7** Document current conflict-check process
- ⬜ **0.8** Finalize engagement-letter AI disclosure language (attorney + ethics review)
- ⬜ **0.9** Confirm AI Gateway ZDR coverage with each provider in writing
- ⬜ **0.10** Set up Vercel team account and billing
- ⬜ **0.11** Set up Langfuse workspace for AI tracing

---

## Phase 1 — Foundation (Week 2)

Scaffold the codebase, identity, hosting. End state: empty bot replies "pong" in Teams.

- ✅ **1.1** Initialize Next.js 16 App Router project with TypeScript, Tailwind, shadcn/ui _(2026-05-20: Next.js 16.2.6, React 19.2, Tailwind v4, shadcn base-nova style, neutral base color, build passes)_
- ✅ **1.2** Configure Vercel project; deploy preview pipeline working _(2026-05-20: Linked to `your-org/ms-teams-legal-os`. `vercel.ts` overrides detected. Preview deploy pipeline ready — actual deploy will run once we have credentials to pass build)_
- ✅ **1.3** Provision Neon Postgres via Vercel Marketplace; enable pgvector extension _(2026-05-21: `neon-amethyst-cushion` linked via Vercel. Connection string set in `.env.local`. Dropped 7 pre-seeded Slack-template tables. Applied drizzle migration `0000_neat_alex_wilder.sql` (12 tables) + hand-written `0001_enable_pgvector_and_embeddings.sql` (pgvector + matter_embeddings + ivfflat index). Helper scripts in `scripts/`)_
- ✅ **1.4** Define `vercel.ts` config with framework, crons, headers _(2026-05-20: 4 crons defined — daily digest, Clio sync, Graph webhook renewal, email reconcile. Security headers set globally. Setup runbook at `docs/vercel-setup.md`)_
- ✅ **1.5** Register Entra ID app: delegated scopes (`Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite.All`, `User.Read`); admin consent flow _(2026-05-22: Single-tenant app registered. Tenant `<tenant-id>`, client `<client-id>`. Four redirect URIs configured (Auth.js sign-in + Graph OAuth, prod + localhost:3000). Admin consent granted for all delegated scopes. Three values pushed to `.env.local` + Vercel production + development via `scripts/seed-entra.ts`. Sign-in verified end-to-end with `you@yourtenant.onmicrosoft.com` against `/admin/sign-in` → `/admin`. Allowlist updated from personal Gmail to tenant user.)_
- ✅ **1.6** Create Azure Bot resource; wire messaging endpoint to Vercel route `/api/teams/messages` _(2026-05-22: Skipped Azure Bot (paywall) — registered bot via Teams Developer Portal instead. Bot ID `<bot-id>`, MultiTenant (Dev Portal default). Endpoint pointed at `https://your-domain.vercel.app/api/teams/messages`. Teams channel enabled. Four `BOT_APP_*` values in `.env.local` + Vercel prod/dev. Adapter smoke test (`scripts/smoke-bot-adapter.ts`) passes: CloudAdapter constructs, isValidAppId=true. Live end-to-end token issuance happens when Teams sends first message — verify after first deploy.)_
- ✅ **1.7** Build Teams app manifest (`manifest.json` + icons); sideload to firm tenant _(2026-05-22: Manifest at schema v1.20 — Teams app GUID `<app-id>`, botId `<bot-id>`, validDomain `your-domain.vercel.app`. Placeholder icons via `scripts/generate-teams-icons.ts`. Three manifest fixes during sideload: schema bump from 1.17→1.20, `groupchat`→`groupChat` casing, removed deprecated `packageName` field. Validated against live v1.20 schema (Python jsonschema, draft-04) — zero errors. Sideloaded successfully into `yourtenant.onmicrosoft.com`.)_
- ✅ **1.8** Implement Bot Framework SDK message handler with JWT validation _(2026-05-20: `app/api/teams/messages/route.ts` + `lib/bot/adapter.ts` (lazy-constructed `CloudAdapter` w/ JWT via Bot Framework auth) + `lib/bot/handler.ts` (message/conversationUpdate/invoke + slash command router with `ping/pong`))_
- ✅ **1.9** Implement `ping` test command; verify round trip from Teams _(2026-05-22: First end-to-end Teams round-trip successful — `ping` → `pong`. Required bot-type flip from MultiTenant to SingleTenant (with `BOT_APP_TENANT_ID=<tenant-id>`) — Teams Dev Portal had registered the bot as SingleTenant in Bot Framework Service even though Entra app accepts both authorities. Diagnosed via decoded JWT tid claims + Vercel runtime logs showing 401 from outbound BFS REST API.)_
- ✅ **1.10** Set up Drizzle ORM with migration system; create initial schema (users, audit_log, agent_configs) _(2026-05-20: 12-table schema in `db/schema.ts` — users, clio_tokens, graph_tokens, clients, matters, matter_aliases, email_summaries, draft_proposals, audit_log, agent_configs, conversation_references, graph_subscriptions. Migration `0000_neat_alex_wilder.sql` generated by drizzle-kit; hand-written `0001_enable_pgvector_and_embeddings.sql` adds pgvector + matter_embeddings table. Migrations not yet applied — requires DB from 1.3)_
- 🟡 **1.11** Implement structured logger; pipe to Vercel Observability + Langfuse _(2026-05-20: Pino logger in `lib/logger.ts` with PII redaction paths (password, token, ssn, dob, authorization, cookie) and pretty-print in dev. Langfuse adapter to be wired when AI calls land in Phase 3)_
- ✅ **1.12** Add app-level envelope encryption helper for token storage _(2026-05-20: `lib/crypto.ts` — AES-256-GCM with per-encrypt random salt + IV, scrypt KDF from `ENCRYPTION_KEY`. Used Node's native `crypto` instead of libsodium to avoid a heavy dep; same security properties)_
- ✅ **1.13** Add Entra SSO middleware for admin routes _(2026-05-20: Auth.js v5 with Microsoft Entra ID provider. JWT sessions, role-based gating via `ADMIN_EMAIL_ALLOWLIST`. Files: `auth.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/admin/{page,sign-in/page}.tsx`. **Deviation from PRD:** used Auth.js instead of Clerk for the 1–3 user pilot — lighter, no third-party account, uses the same Entra app. Easy swap later if multi-tenant needs change)_

**Phase 1 done when:** bot responds in Teams, deploys are clean, audit log table accepts writes.

---

## Phase 2 — Clio Foundation (Week 3)

End state: nightly Clio sync running; fuzzy matter resolver returns ranked candidates.

- ✅ **2.1** Register Clio OAuth app; capture client_id / secret in Vercel env _(2026-05-21: Clio dev app created. `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`, `CLIO_REDIRECT_URI` set in `.env.local` (localhost) + Vercel Production (vercel.app domain) + Vercel Development (localhost). Authorize URL smoke-tested. Webhook secret deferred until first deploy + webhook subscription)_
- ✅ **2.2** Implement per-user Clio OAuth flow (initiated from Teams task module) _(2026-05-20: Routes at `app/api/clio/oauth/{authorize,callback}/route.ts` with state cookie + CSRF check. Helpers in `lib/clio/oauth.ts`. Teams task-module integration wired in Phase 3)_
- ✅ **2.3** Store encrypted access + refresh tokens in `clio_tokens` table _(2026-05-20: `lib/clio/tokens.ts` — saveClioTokens / loadClioTokens / deleteClioTokens with AES-256-GCM envelope encryption via `lib/crypto.ts`)_
- ✅ **2.4** Implement Clio API client with rate limiting (token bucket) and refresh-on-401 _(2026-05-20: `lib/clio/client.ts` — typed `clioFetch<T>` + `clioPaginate<T>` with token-bucket rate limit (20 burst, 5/s sustained) via `lib/rate-limit.ts`. Auto-refresh 60s before expiry; 429 backoff with Retry-After honored)_
- ✅ **2.5** Build nightly sync job (Vercel Cron): clients, matters, contacts, custom fields → Postgres _(2026-05-20: `lib/clio/sync.ts` paginates contacts + matters (with custom_field_values) and upserts via Drizzle. Cron entry at `app/api/cron/clio-sync/route.ts` runs daily 09:00 UTC — config in `vercel.ts`. Will actually run once DB + Clio creds land)_
- ✅ **2.6** Set up Clio webhook receiver `/api/clio/webhooks`; handle matter create/update events _(2026-05-20: `app/api/clio/webhooks/route.ts` + `lib/clio/webhooks.ts` with HMAC-SHA256 signature verification (timing-safe). On matter/contact events, triggers a partial resync. Every event is audit-logged. Clio webhook subscription must be registered via Clio app dashboard once URL is live)_
- ✅ **2.7** Generate embeddings for matter display_name + description + contacts via Vercel AI Gateway embeddings _(2026-05-20: `lib/clio/embeddings.ts` batches 50 matters at a time through `embedMany` on `openai/text-embedding-3-small` via the AI Gateway. Source text combines display name + client name + description + custom fields)_
- ✅ **2.8** Store embeddings in `matter_embeddings` (pgvector ivfflat index) _(2026-05-20: Stored via raw SQL with ON CONFLICT upsert. ivfflat cosine_ops index defined in migration `0001_enable_pgvector_and_embeddings.sql`. Vector dim 1536)_
- ✅ **2.9** Implement hybrid search: Postgres tsvector BM25 + pgvector cosine _(2026-05-20: `lib/clio/search.ts` — single SQL query computes ts_rank_cd BM25 + cosine similarity + alias match boost. Weights: BM25=0.4, cosine=0.5, alias_match=+0.1. Filters out learned-negative matterIds. Returns hybridScore-ordered candidates)_
- ✅ **2.10** Implement LLM re-rank step (Sonnet) for top-10 candidates given email/chat context _(2026-05-20: `findMatter` in `lib/clio/find-matter.ts` calls `generateObject` with Zod-schema'd relevance scores from `claude-haiku-4-5` (low-cost router model). Each candidate gets `llmRelevance` + `llmReasoning`. Final confidence blends hybridScore (0.4) + LLM relevance (0.6))_
- ✅ **2.11** Implement confidence scoring + threshold tiers (≥0.90, 0.70–0.89, <0.70) _(2026-05-20: Decision tiers as constants in `CONFIDENCE`: `auto_attach` ≥0.9, `hitl_confirm` 0.7–0.89, `flag_low_confidence` <0.7, `no_candidates` when search is empty. Alias-only matches with hybrid>0.5 short-circuit to auto_attach)_
- ✅ **2.12** Build `find_matter` tool (Zod-typed) exposed to agent runtime _(2026-05-20: `findMatter(query, { context?, learnedNegatives? })` returns `MatterResolution` — typed candidates + decision tier. Tool wiring for AI agent runtime in Phase 3 once routing-by-tool lands)_
- ✅ **2.13** Add learned-aliases table; record corrections from HITL flow _(2026-05-20: `matter_aliases` table already in schema. Helpers in `lib/clio/aliases.ts` — `recordPositiveAlias`, `recordNegativeAlias`, `loadNegativeAliasesForQuery`. Positive aliases boost match score; negative ones are filtered out)_
- ✅ **2.14** Teams slash command `/find-matter <query>` returns top 3 with confidence _(2026-05-20: Wired in `lib/bot/handler.ts`. Sends typing indicator, runs full pipeline, returns formatted markdown with ✅/🟡/⚠️ confidence indicators per candidate. End-to-end test requires DB + Clio data + AI Gateway access)_

**Phase 2 done when:** `/find-matter "smith vs jones"` returns correct matter with confidence ≥0.9 on 90% of test queries.

---

## Phase 3 — Outlook Ingestion (Week 4)

End state: emails flow in via Graph webhooks; triage agent produces classifications + summaries.

- ✅ **3.1** Implement per-user Graph OAuth (delegated scopes) initiated from Teams _(2026-05-25: Mirrored Clio OAuth shape — `lib/graph/{oauth,tokens}.ts` + `app/api/graph/oauth/{authorize,callback}/route.ts`. Reuses existing single-tenant Entra app (`<client-id>`) and pre-registered redirect URI. Delegated scopes: offline_access, openid, profile, email, User.Read, Mail.Read, Mail.ReadWrite, Mail.Send, Files.ReadWrite.All. Tokens AES-256-GCM encrypted in `graph_tokens`. Added "Connect Outlook" card on `/admin`. `GRAPH_REDIRECT_URI` set in `.env.local` (localhost) + Vercel prod/dev (production callback). Deployed; authorize endpoint returns 401 unauthenticated as expected. End-to-end consent test pending user action.)_
- ✅ **3.2** Subscribe to Graph change notifications for Inbox per user (`/me/mailFolders/Inbox/messages`) _(2026-05-25: `lib/graph/client.ts` — token-bucket rate-limited `graphFetch<T>` + `graphPaginate<T>` with auto-refresh 60s before expiry and 429 backoff. `lib/graph/subscriptions.ts` — `createInboxSubscription` / `renewSubscription` / `deleteSubscription` / `ensureInboxSubscription` / `listExpiringSubscriptions`. 2.8-day expiration (safe under Graph 3-day max). Per-sub `clientState` random nonce for webhook auth. Persists to `graph_subscriptions` table on create/renew. `POST /api/graph/subscriptions` creates an Inbox sub; `GET` lists, `DELETE` removes. Webhook receiver wired in 3.3.)_
- ✅ **3.3** Implement webhook validation + subscription renewal cron (every 24h, ~3 day expiry) _(2026-05-25: `app/api/graph/webhooks/route.ts` — handles Graph validation handshake (POST with `?validationToken=` → 200 text/plain echo), then validates each notification against stored `clientState` and writes an `audit_log` row. Unknown subscriptions and clientState mismatches are dropped with a warning. `app/api/cron/graph-subscriptions-renew/route.ts` — cron at `0 */6 * * *` (already in `vercel.ts`); renews anything expiring within 12h, deletes local rows for subs Graph has dropped. CRON_SECRET-gated.)_
- ✅ **3.4** Implement reconciliation polling (every 15 min) as safety net _(2026-05-25: `lib/graph/reconcile.ts` — `reconcileInboxForUser` pulls Inbox messages with `$filter=receivedDateTime ge <checkpoint>` ordered desc, audit-logs each one, advances per-user checkpoint. 60s overlap window absorbs clock skew. `reconcileAllUsers` iterates everyone with Graph tokens. Cron at `app/api/cron/email-reconcile/route.ts` (schedule `*/15 * * * *` from `vercel.ts`). Added `last_reconciled_at timestamptz` column to `graph_tokens` (migration `0002_add_last_reconciled_at.sql`, applied via `scripts/add-last-reconciled-at.ts`). Drizzle journal updated to also track the previously-manual pgvector migration. CRON_SECRET-gated.)_
- ✅ **3.5** Email ingest pipeline: enqueue to Vercel Queues on receipt _(2026-05-25: `lib/graph/ingest.ts` — single `ingestInboxMessage({ userId, messageId, source })` producer entry point called from both webhook (`changeType === 'created'` only) and reconcile cron. Dedupes against (a) already-triaged `email_summaries` and (b) any enqueue audit row within the last hour. Enqueue today = audit_log row tagged `graph.ingest.enqueued`; `listPendingTriageIngests()` exposed for the 3.6 worker to drain FIFO. Swap to Vercel Queues happens when triage worker stabilizes (queues are beta — keeping the producer interface stable so the swap is one-line).)_
- ✅ **3.6** Triage worker: Sonnet classifies importance + extracts entities (parties, dates, amounts) → Zod schema _(2026-05-25: `lib/email/triage.ts` — Zod schema (importance enum, summary 10-800 chars, actionItems[], extractedEntities{parties, dates, amounts, matterHints}); Sonnet 4.6 via Gateway with PI-firm system prompt; temperature 0; 8k-char body cap for cost control. `lib/email/worker.ts` — drains `listPendingTriageIngests`, fetches full message (with stripHtml), runs triage, writes `email_summaries` row + audit log with model=`anthropic/claude-sonnet-4-6`. Handles 404 (deleted) and other errors with status flags. `POST /api/graph/triage` — auth-gated drain endpoint (admin session OR CRON_SECRET). Smoke test on real Inbox: 5 messages triaged in 14s wall clock, all correctly classified as noise (Microsoft billing/admin), 2-4s latency each. Also flipped bot chat fallback back to Sonnet now that paid AI credits work.)_
- ✅ **3.7** Run fuzzy matter resolution against extracted client/party context _(2026-05-25: `resolveMatterForTriage` in `lib/email/worker.ts` composes a query from triage's `extractedEntities.matterHints` + `parties` + `subject`, passes `Email from: {addr} / Summary: {summary}` as context to `findMatter`, and writes top candidate's `matterId` + `matterConfidence` (as int %) into `email_summaries`. Skipped for `noise` to save a search + LLM call. Audit row captures matter + confidence alongside triage output.)_
- ✅ **3.8** PII redaction layer (SSN, account #, DOB) before LLM call where not required _(2026-05-25: `lib/pii.ts` — `redactPII(text)` returns `{redacted, stats}`. Patterns: US SSN (negative lookahead excludes invalid ITIN-style 9xx-xx-xxxx), DOB mm/dd/yyyy (years 1900-2025), bank/account numbers (12-19 consecutive digits), CA-style DL (1 letter + 7 digits). Emails + phones intentionally preserved (case-party identification). Applied at body-before-triage in `lib/email/worker.ts` and at chat-input-before-LLM in `lib/bot/chat.ts`. Originals stay in `audit_log` (admin-gated). Smoke at `scripts/smoke-pii.ts`. Negative lookahead correctly leaves invalid SSNs alone (e.g. 999-prefixed).)_
- ✅ **3.9** Store `email_summaries` rows with importance, matter_id, summary _(2026-05-25: Implemented as part of `triageOne` in `lib/email/worker.ts` — single insert with `graphMessageId`, `userId`, `importance`, `summary`, `actionItems[]`, `receivedAt`, `matterId`, `matterConfidence`. `onConflictDoNothing` on `(graphMessageId, userId)` makes the write idempotent across reconcile/webhook overlaps.)_
- ✅ **3.10** Important emails (>= configured threshold) → proactive Teams card to attorney _(2026-05-25: Adaptive Cards v1.5 schema generator at `lib/bot/cards.ts` — color-coded importance, FactSet for matter+confidence, action list, Open-in-Outlook + Draft-reply actions. `lib/bot/conversation-refs.ts` captures + persists `TurnContext.getConversationReference()` on every turn, keyed by entraOid → user.id. `lib/bot/proactive.ts` sends via `CloudAdapter.continueConversationAsync`; cleanly skips users with no reference (first-time = no proactive). Triage worker (`lib/email/worker.ts`) pushes a card for urgent + actionable only; informational/noise will surface in the daily digest (Phase 7). Threshold "urgent OR actionable" is the configured default — admin tunability lands in Phase 8. Adapter exposed `getAdapterForProactive()` to share the cached singleton.)_
- ✅ **3.11** Add per-matter token budget tracking + alert on overage _(2026-05-25: New `matter_token_budgets` table (migration `0003_matter_token_budgets.sql` applied via `scripts/apply-matter-budgets-migration.ts`) — input/output token counters, cents accumulator, per-matter soft ($20) + hard ($100) limits, alerted_at timestamps to avoid duplicate alerts. `lib/ai/budget.ts` — `recordMatterUsage` upserts running totals + estimates cost via per-model rate table (Haiku/Sonnet/Opus/embeddings) and emits `ai.budget.soft_breach` / `ai.budget.hard_breach` audit rows on threshold crossings. `isOverHardLimit` exposed so callers (e.g. Opus drafting in 5.x) can short-circuit. Triage worker (`lib/email/worker.ts`) now records token usage against the resolved matter for every email it triages; `triageMessage` returns `{output, usage, model}`. Drizzle journal updated to track migration 0003.)_
- ✅ **3.12** Teams command `/summarize-thread <link>` returns thread summary with action items _(2026-05-25: `lib/email/summarize-thread.ts` — accepts a Graph message id (AAMk…) or RFC 2822 internetMessageId; resolves to a conversationId; fetches up to 25 messages chronologically; strips HTML + redacts PII; runs Sonnet 4.6 with `ThreadSummarySchema` (headline, chronological summary, openQuestions, actionItems, participants); returns structured result + markdown formatter. Bot handler at `lib/bot/handler.ts` wires `/summarize-thread <identifier>` — resolves teams AAD → user, shows typing indicator, prints formatted markdown.)_

**Phase 3 done when:** new emails appear as Teams cards within 60 seconds; classification precision ≥90% on labeled test set.

---

## Phase 4 — Clio Notes + HITL Approval (Week 5)

End state: attorney can approve an email-derived note from a Teams card; it lands in Clio.

- ✅ **4.1** Design Adaptive Card schema for note approval (matter, summary, edit field, approve/reject buttons) _(2026-05-25: `buildNoteApprovalCard` in `lib/bot/cards.ts` — Adaptive Card v1.5 with matter FactSet, source label, optional `Input.ChoiceSet` for matter override (only present when 4.8's alternates list is non-empty), multiline `Input.Text` for note body (4000 char cap), positive/destructive Approve/Reject buttons. `buildNoteConfirmationCard` for the post-write success state. Action routing infra at `lib/bot/actions.ts` — `registerAction(kind, handler)` registry + `dispatchCardAction` resolves payload.kind → handler with friendly fallback on miss. Handler dispatch wired into `handleMessage` (Action.Submit lands as Message with `activity.value` and no text).)_
- ✅ **4.2** Build draft_proposal lifecycle: pending → approved → executed (or rejected) _(2026-05-25: `lib/proposals.ts` — `createProposal` / `getProposal` / `approveProposal` (with `editedPayload` merge) / `rejectProposal` (with reason) / `markExecuted` (records externalId + externalUrl into payload.execution) / `markFailed` / `listPendingProposals`. State machine guards: approve/reject require `pending`, markExecuted requires `approved`. Every state transition writes an audit_log row tagged `proposal.{type}.{action}`.)_
- ✅ **4.3** Implement Clio note creation tool (`POST /api/v4/notes.json`) with idempotency key _(2026-05-25: `lib/clio/notes.ts` — `createClioNote({clioMatterId, subject, body, date?, idempotencyKey})` posts to `/notes.json` with `X-Idempotency-Key` header, type=Matter, `matter.id = clioMatterId`. Returns `{clioNoteId, clioWebUrl}`. 422-with-existing-id branch returns the original note instead of throwing on duplicate.)_
- ✅ **4.4** On HITL approval, deterministic worker executes Clio write + logs audit row _(2026-05-25: `lib/bot/handlers/clio-note.ts` — registers `clio.note.approve` + `clio.note.reject`. Approve flow: ownership check → status guard → matter override resolution → approve proposal (state lock) → `createClioNote` with idempotency key derived from proposal id → markExecuted with Clio note id + URL → send `buildNoteConfirmationCard`. Concurrent-click safe (status guard before write). Failure path → markFailed with reason.)_
- ✅ **4.5** On edit, capture edited text, re-validate, then execute _(2026-05-25: The Adaptive Card's `Input.Text` value arrives as `note_body` in the Action.Submit payload; the approve handler reads it, validates non-empty, merges into `editedPayload` via `approveProposal`, and writes the edited body to Clio. Original draft stays preserved in the proposal payload for audit.)_
- ✅ **4.6** On rejection, log reason, feed to alias learning if matter was wrong _(2026-05-25: Reject handler calls `rejectProposal` with reason "attorney rejected via card", then records the original query as a negative alias for the proposed matter (so the next /find-matter call demotes that matter). Approve-with-override path also fires: negative alias on the originally-proposed matter + positive alias on the override.)_
- ✅ **4.7** Send confirmation card back to attorney with link to Clio note _(2026-05-25: `buildNoteConfirmationCard` in `lib/bot/cards.ts` — green "Note saved to Clio" header, matter display name, body preview (280 chars), Action.OpenUrl to the Clio note. Sent by the approve handler after `markExecuted` succeeds.)_
- ✅ **4.8** Below-threshold matter matches: show top 3 candidates in card for selection _(2026-05-25: The note approval card's `Input.ChoiceSet` for `matter_override` is built from up to 3 alternate candidates (passed in `alternateMatters`). The approve handler honors the override and feeds it into both the Clio write and alias learning. Caller (note-proposal builder, lands when a triage card's "Save as Clio note" action fires) decides when to populate alternates — typically when top confidence is in the HITL band (0.7–0.89).)_

- ✅ **4.9** [Scope addition 2026-05-25] Intake extraction agent: from chat/email context, propose new Clio matter fields (client name/email, matter description, practice area, responsible attorney) → Zod schema _(2026-05-25: `lib/clio/intake.ts` — `extractIntake({freeText, receivedAt?})` runs Sonnet 4.6 with `IntakeSchema` (client {first, last, email?, phone?, isExisting}, matter {description, practiceArea enum: MVA/WC/Premises/MedMal/AnimalAttack/Employment/OtherCivil, accidentDate?, location?, injuries?, opposingParties[]?}, notes, confidence). Anti-hallucination guardrails in system prompt. 6k-char input cap. Returns usage for budget tracking.)_
- ✅ **4.10** [Scope addition 2026-05-25] Intake Adaptive Card: editable fields, "Approve & create" / "Reject" actions; handles new-contact vs existing-contact paths _(2026-05-25: `buildIntakeApprovalCard` — confidence flag header, two-column client name row, email/phone, `Input.Toggle` for existing-vs-new client, multiline description, `Input.ChoiceSet` for practice area (7 options), accident date, location, injuries, opposing parties, intake notes. `buildIntakeConfirmationCard` for post-create. `/intake <description>` slash command extracts → creates proposal (type stored in payload.intakeKind) → sends card. Reject + approve actions land in 4.11.)_
- ✅ **4.11** [Scope addition 2026-05-25] Clio matter create tool (`POST /api/v4/matters.json`) + contact create (`POST /api/v4/contacts.json` when needed); confirmation card with link back to Clio _(2026-05-25: `lib/clio/matters-write.ts` — `createClioContact` (Person type, email/phone arrays) + `createClioMatter` (client.id + description + Open status), both with idempotency keys and 422-existing-id branches. `lib/bot/handlers/intake.ts` — approve flow: ownership/status guards → approveProposal with edited payload → existing-client DB lookup (ilike on first+last) when toggle is on → else createContact → createMatter → optional intake note via `createClioNote` with stable key → markExecuted with contactId + matterId + intakeNoteUrl in payload.extra → send `buildIntakeConfirmationCard`. Non-fatal note creation: if note fails after matter succeeds, matter creation still counts as success. Manifest updated with `intake` slash command; zip repackaged. Deployed.)_

**Phase 4 done when:** end-to-end flow works for 5 test emails, all notes appear in Clio with correct matter. Plus: intake flow can create a new matter from a free-form description with attorney HITL.

---

## Phase 5 — Outlook Draft Generation (Week 6)

End state: attorney can request a draft reply in Teams; draft appears in Outlook ready to send.

- ✅ **5.1** Implement matter context retrieval (last N notes, parties, status, key dates) for prompt _(2026-05-25: `lib/clio/matter-context.ts` — `getMatterContext(userId, matterId, {recentNoteLimit?})` joins matter + client from DB + last N notes from Clio (`/notes.json?matter_id=…&order=date(desc)`). Fails soft on notes 404. `formatMatterContextForPrompt(ctx)` returns a structured plain-text block (matter id, status, description, client w/ email, non-empty custom fields, recent notes with 600-char detail truncation) ready to inject into Opus's prompt.)_
- ✅ **5.2** Drafting Agent prompt (Opus): tone-matched, fact-grounded, never invents numbers/dates _(2026-05-25: `lib/email/draft-reply.ts` — `generateDraftReply({matterContext, threadTranscript, attorneyDirective?})` runs Opus 4.7 via Gateway with `DraftSchema` (subject, body, tone enum, citedFacts[], uncertainties[]). System prompt explicitly forbids invented numbers/dates/parties, mandates plain-text + no signature, tone-matching, conciseness, and grounded CA-specific procedural references. Thread transcript passes through `redactPII` before Opus sees it. Temperature 0.2.)_
- ✅ **5.3** Structured-output validation: draft must reference real matter fields; reject hallucinated entities _(2026-05-25: `validateDraftAgainstSources` in `lib/email/draft-reply.ts` — token-level check that every 4+ digit number and every $-prefixed amount in (a) citedFacts and (b) the body appears in matter context or thread (comma + $ stripped before compare). Hard guard via the Zod schema requiring `citedFacts.min(1)`. Result returned as `validationWarnings[]` so the UI can flag suspect drafts to the attorney without blocking — V1 is HITL, so the attorney is the final arbiter.)_
- ✅ **5.4** Graph API create draft (`POST /me/messages`) — saves to Drafts folder _(2026-05-25: `lib/graph/drafts.ts` — `createReplyDraft({inReplyToMessageId, body, subject?})` uses Graph's `/me/messages/{id}/createReply` (preserves thread + In-Reply-To headers) → PATCH body + optional subject. Returns `{draftId, webLink, conversationId}`. Plain-text content type. Lands in Outlook Drafts; nothing sent.)_
- ✅ **5.5** Teams preview card with draft body + "Open in Outlook" deep link _(2026-05-25: `buildDraftReplyPreviewCard` in `lib/bot/cards.ts` — color-coded tone header (cordial/firm/urgent/sympathetic), Matter/Tone FactSet, subject + body, "Cited facts" subtle list, "⚠️ Open questions" amber list, "🚨 Validation warnings" red list (rendered only when populated), Action.OpenUrl deep link to the Outlook draft webLink.)_
- ✅ **5.6** Teams command `/draft-reply <thread-link>` triggers full pipeline _(2026-05-25: `lib/email/draft-pipeline.ts` — `runDraftReplyPipeline({userId, messageId, attorneyDirective?})` orchestrates seed-message fetch → conversationId thread (≤25, oldest→newest) → matter resolution (subject + sender + last 3 bodies as context) → `getMatterContext` → Opus draft via `generateDraftReply` → budget recording → `createReplyDraft` in Outlook → audit log → return `DraftPipelineResult`. Slash command supports optional directive after `--` (e.g. `/draft-reply <msgId> -- decline politely`). Throws if no matter resolves so we never draft against nothing.)_
- ⬜ **5.7** Capture attorney edits when they send (via sent-items webhook) to feed prompt tuning later

**Phase 5 done when:** 10 test drafts produced; ≥60% sent with minor edits.

---

## Phase 6 — Financial Document Extraction (Week 7)

End state: paystub from email attachment becomes structured fields proposed to Clio custom fields.

- ⬜ **6.1** Detect attachments in incoming emails; classify document type (Sonnet + vision)
- ⬜ **6.2** Route to Azure Document Intelligence: pay stub prebuilt, W-2 prebuilt, 1099 prebuilt; custom model placeholder for bank stmt + tax return
- ⬜ **6.3** Upload original to OneDrive matter folder via Graph (path convention from 0.3)
- ⬜ **6.4** Extracted fields → Zod schema validation
- ⬜ **6.5** HITL approval card: show extracted fields side-by-side with source thumbnail; allow inline edits
- ⬜ **6.6** On approve: create Clio note + update Clio matter custom fields (Elite)
- ⬜ **6.7** Track extraction confidence per field; flag any <0.85 for mandatory review
- ⬜ **6.8** Self-employed / unusual format detection → bypass auto-extract, flag for manual

**Phase 6 done when:** 20 sample paystubs run through pipeline; ≥95% field-level accuracy.

---

## Phase 7 — Daily Reports & Cron (Week 8)

End state: attorney gets 06:30 PT proactive Teams card summarizing the day.

- ⬜ **7.1** Reporting Agent (Sonnet) prompt: aggregate yesterday's important emails, matter updates, billing summary, follow-ups
- ⬜ **7.2** SQL aggregation queries (deterministic) provide the data; LLM only narrates
- ⬜ **7.3** Vercel Cron job 06:30 PT per attorney
- ⬜ **7.4** Proactive Teams message via stored conversationReference
- ⬜ **7.5** Adaptive Card with collapsible sections + jump-to-Clio links
- ⬜ **7.6** Configurable cron schedule per user (admin page)
- ✅ **7.7** "Send me one now" Teams command for on-demand digest _(2026-06-01: Implemented as `/today` — the canonical PRD §6.1 command, pulled forward ahead of Phase 7 on attorney request. `lib/clio/calendar.ts` (today's calendar entries, PT day bounds w/ DST-aware offset) + `lib/clio/tasks.ts` (incomplete tasks, client-filtered to due≤today incl. overdue) + `lib/today/digest.ts` (gathers calendar + tasks + last-24h important emails from `email_summaries`; Sonnet reporting agent sorts every item into 🔴 do-first / 🟡 do-today / 🟢 batch-later referencing items by stable id only — data deterministic, LLM only ranks per §9.4; audit-logged). Wired `handleToday` in `lib/bot/handler.ts` replacing the stub. Degrades gracefully when Clio not connected (emails-only + connect prompt). **Honest scope:** surfaces Clio-calendar deadlines but does NOT compute statute-of-limitations dates — footnoted in output. Typecheck + lint clean.)_
  - _2026-06-01 fix: live `/today` hit Clio 400 — `complete` was in the tasks `fields=` list but is a filter-only param on Clio's task resource (use `status` as a field). Removed from fields, kept `complete=false` filter. Also capped tasks at top 25 (priority, then most-overdue) since test account had 87 overdue — avoids a wall-of-bullets digest and planner bucket overflow. Redeployed._

**Phase 7 done when:** digest delivered for 5 consecutive business days, attorney rates ≥4/5 utility.

> **Note (2026-06-01):** `/today` landed early via 7.7. It already does a first pass of 7.1 (reporting agent narration) and 7.2 (deterministic data → LLM narrates). Still open for full Phase 7: billing-summary + follow-up aggregation in the digest (7.1), the 06:30 PT cron (7.3), proactive push via stored conversationReference (7.4 — infra exists from 3.10), collapsible Adaptive Card w/ jump-to-Clio links (7.5), and per-user schedule config (7.6).

---

## Phase 8 — Admin Page & Audit Log Viewer (Week 9)

End state: admin can edit prompts, view audit log, toggle integrations.

- ⬜ **8.1** Admin layout under `/admin`, Entra SSO + admin-role gate
- ⬜ **8.2** Agent configs CRUD page: list agents, edit prompt + model + params, version on save
- ⬜ **8.3** Audit log viewer: filter by user, agent, tool, status, date range
- ⬜ **8.4** Integration toggles per user (Outlook on/off, Clio on/off)
- ⬜ **8.5** Cron schedule editor (cron expression + plain English helper)
- ⬜ **8.6** Notification routing: which Teams DM/channel for which event
- ⬜ **8.7** Export audit log to CSV for bar compliance / discovery

**Phase 8 done when:** non-engineer admin can change a prompt, see effect, view trace.

---

## Phase 9 — Pilot Hardening & Launch (Week 10–12)

End state: pilot attorney + 1–2 staff using the system daily.

- ⬜ **9.1** Eval test set automation: nightly run against 50-item labeled set; alert on regression
- ⬜ **9.2** Load test: 500 emails/day across 3 users
- ⬜ **9.3** Error budget dashboard; alert thresholds set
- ⬜ **9.4** Disaster recovery runbook: token compromise, AI provider outage, database failure
- ⬜ **9.5** User-facing docs: Teams quickstart, command reference, FAQ
- ⬜ **9.6** Onboard attorney(s); supervised first week with daily check-ins
- ⬜ **9.7** Capture week-1 feedback; prioritize fixes
- ⬜ **9.8** Pilot success review at week 4: hit success metrics from PRD §10

**Phase 9 done when:** pilot users sustain daily usage and success metrics from PRD §10 are met.

---

## Cross-Cutting / Always-On

- ⬜ Audit log writes on every AI action (added to every tool)
- ⬜ Zod schemas for every structured output (no free-text-to-database)
- ⬜ Token usage + cost tracking per agent per user (Langfuse + DB)
- ⬜ ZDR confirmation flag on every Gateway call
- ⬜ HITL is the default for any external-system write

---

## Out of Scope for V1 (parked for V2/V3)

- Billing draft automation
- OneDrive document write-back beyond uploads
- Workflow builder UI
- LawToolBox / court calendar integration
- Conflict-of-interest automation
- Multi-agent orchestration beyond router + specialists
- RBAC beyond admin / user
- Multi-tenant architecture
- Voice / mobile clients
- SOC 2 Type II
