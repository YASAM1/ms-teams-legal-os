# Microsoft Teams Legal Operations Agent — PRD

**Project codename:** Teams Legal OS
**Version:** 0.1 (Pilot)
**Owner:** you@example.com
**Last updated:** 2026-05-20
**Status:** Approved scope, pre-build

---

## 1. Background & Problem

A California family law firm runs day-to-day operations across Microsoft Teams (chat), Microsoft Outlook (email), OneDrive (documents), and Clio Manage Elite (matter management). Staff time is consumed by:

- Triaging long, emotionally-loaded client emails
- Manually summarizing client communications into Clio notes
- Drafting routine Outlook replies referencing matter context
- Locating and updating Clio matters from email/chat context
- Compiling daily status of important emails, matter updates, billing, and follow-ups
- Extracting structured financial data from pay stubs, W-2s, 1099s, bank statements, and tax returns for California family law disclosures (FL-150, FL-142)

There is no operational AI teammate inside Teams that connects these systems. The firm has all required credentials, OAuth permissions, and administrative access to Microsoft 365 and Clio.

## 2. Goal

Ship an AI operational teammate, accessible inside Microsoft Teams, that drafts, summarizes, routes, and proposes actions across Outlook, OneDrive, and Clio — with a strict **drafts-only / human-in-the-loop** policy for any external-facing or financial action. Save 10+ hours/week per attorney in the pilot phase.

## 3. Non-Goals (V1)

- Autonomous outbound email sending
- Autonomous billing entries or financial transactions
- Multi-tenant SaaS architecture
- Workflow builder UI for non-technical users (deferred to V2)
- OneDrive document *write* operations beyond proposed updates with explicit approval
- Integration with court calendaring tools (LawToolBox, CalendarRules) — V2
- Voice / mobile clients
- Multi-agent orchestration beyond router + specialists

## 4. Users & Personas

| Persona | Description | Primary surface |
|---|---|---|
| Pilot Attorney | California family law attorney, 5–20 yrs experience | Teams chat, Outlook, Clio |
| Paralegal / Legal Assistant | Supports attorney on intake, document processing, billing | Teams chat, Outlook, Clio |
| Firm Admin (internal) | Approves AI capabilities, edits configs, reviews audit log | Admin web page |

Pilot scale: **1–3 users total.**

## 5. Constraints & Compliance

- **Jurisdiction:** California family law. Must align with CA State Bar guidance on generative AI in legal practice (Practical Guidance for the Use of Generative AI in the Practice of Law, 2023).
- **Confidentiality:** All client data is presumptively privileged. Zero data retention (ZDR) at the AI provider layer is mandatory.
- **Auditability:** Every AI-assisted action must be logged immutably with prompt, model, output, timestamp, and acting user.
- **Conflict of interest:** No new-matter automation may proceed without conflict check.
- **Disclosure:** Engagement-letter language acknowledging AI use must be in place before pilot launch.
- **Data residency:** US-only for all storage and AI inference.
- **PII / financial data:** SSN, account numbers, DOB redacted before LLM transmission where not strictly required.

## 6. Product Surface

### 6.1 Microsoft Teams Bot
- 1:1 chat and @-mention in channels
- Adaptive Cards for human-in-the-loop approvals (Approve / Edit / Reject)
- Proactive messages (daily reports, urgent email alerts)
- Task-module dialogs for Clio OAuth consent and matter selection
- Slash commands: `/find-matter`, `/summarize-thread`, `/draft-reply`, `/today`

### 6.2 Outlook Integration (read + drafts only)
- Real-time inbox watching via Microsoft Graph change notifications
- Reconciliation polling every 15 minutes as safety net
- Drafts created via Graph; attorney sends from Outlook or Teams card
- Per-user delegated permissions only

### 6.3 OneDrive Integration
- Read access to matter folders
- Document Intelligence extraction from financial documents
- V1: propose updates only; do not write back to OneDrive autonomously

### 6.4 Clio Integration
- Nightly sync of clients, matters, contacts, custom fields to local Postgres
- Real-time webhook ingestion (Clio Elite)
- Read: full search and matter context retrieval
- Write: notes and communications via HITL approval
- Custom fields: store extracted financial data per matter
- Billing: drafts only, attorney posts manually

### 6.5 Admin Page (minimal)
- View/edit agent system prompts (versioned)
- View audit log with filters
- Toggle integrations on/off per user
- Configure cron schedules and notification destinations
- Internal only, Entra SSO, admin role gated

## 7. Functional Requirements

### F1. Conversational Teams Agent
**Must:** Respond to direct messages and @-mentions in channels. Maintain conversation context per thread. Surface specialist actions through Adaptive Cards.

### F2. Email Triage & Daily Digest
**Must:** Classify incoming emails by importance (urgent / actionable / informational / noise). Generate daily digest at configurable time (default 06:30 PT) delivered to Teams as a proactive card per attorney.

### F3. Email Summarization → Clio Note Proposal
**Must:** When an email thread is selected (Teams command or auto-detected), summarize key facts, dates, parties, action items. Propose a Clio note with the matching matter (HITL approval card) before writing.

### F4. Fuzzy Matter Resolution
**Must:** Given free-text context (email body, chat message, client name fragment), return ranked Clio matter candidates with confidence scores.
- ≥0.90: auto-attach with notification
- 0.70–0.89: surface in HITL card for confirmation
- <0.70: flag, do not auto-act
**Must:** Learn from corrections — store negative/positive mappings as aliases.

### F5. Outlook Draft Generation
**Must:** Generate Outlook drafts referencing matter context (recent notes, parties, deadlines). Save as Outlook draft via Graph. Surface in Teams as preview card. Attorney sends from Outlook native.

### F6. Financial Document Extraction (Family Law)
**Must:** Detect financial documents in email attachments and OneDrive folders. Extract structured fields:
- Pay stub: employer, gross income, net income, period start/end, YTD figures
- W-2: employer, wages, withholdings, year
- 1099: payer, amount, type, year
- Bank statement: institution, account last-4, period, ending balance
- Tax return: filing status, AGI, total income, year
**Must:** Propose a Clio note + custom field updates via HITL card. Never auto-write financial figures.

### F7. Daily Cron Reports
**Must:** Per-user 06:30 PT report including:
- Important emails since last report
- Matter updates (from Clio webhooks/sync)
- Client communications logged
- Billing activity summary (read-only view)
- Follow-up recommendations from open action items

### F8. Audit Log
**Must:** Append-only log of every AI tool call, model call, and user-facing action. Include: timestamp, user, agent, model, prompt hash, tool name, input, output, approval status. Searchable through admin page.

### F9. Authentication
**Must:** Microsoft Entra SSO for Teams and admin. Per-user Clio OAuth with encrypted refresh token storage. No shared credentials.

### F10. Admin Configuration (minimal v1)
**Must:** Web page (internal) for prompt editing, audit log viewing, integration toggles, cron schedule editing, notification routing.

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | 99% during pilot business hours (Mon–Fri 7am–7pm PT) |
| Latency | Teams responses <3s for conversational turns; <30s for complex retrieval |
| Throughput | Up to 500 emails/day across pilot users |
| Security | TLS 1.3 in transit; AES-256 at rest; app-level envelope encryption for tokens |
| AI privacy | Zero data retention at provider via Vercel AI Gateway |
| Audit retention | 7 years (state bar minimum) |
| Backup | Daily Postgres snapshots, 30-day retention |

## 9. Technical Architecture

### 9.1 Stack
- **Hosting:** Vercel (Next.js 16 App Router, Fluid Compute)
- **Teams:** Microsoft Bot Framework SDK v4 (Node) + Azure Bot Service
- **Identity:** Microsoft Entra ID (Azure AD)
- **AI:** Vercel AI SDK v6 via Vercel AI Gateway
  - Claude Opus 4.7 — drafting, complex reasoning
  - Claude Sonnet 4.6 — summarization, classification at volume
  - Claude Haiku 4.5 — routing, simple intent
- **Durable workflows:** Vercel Workflow DevKit
- **Async fanout:** Vercel Queues
- **Cron:** Vercel Cron Jobs
- **Database:** Neon Postgres (Vercel Marketplace) + pgvector
- **Doc parsing:** Azure Document Intelligence (prebuilt + custom models)
- **Storage:** OneDrive (source of truth), Vercel Blob (ephemeral OCR cache)
- **Observability:** Vercel Observability + Langfuse for AI traces

### 9.2 Agent Topology
- **Router** (Haiku) — classifies inbound Teams messages, dispatches
- **Triage Agent** (Sonnet) — email classification + summary
- **Drafting Agent** (Opus) — reply drafts with matter context
- **Clio Scribe** (Sonnet) — structured output → tool calls
- **Doc Agent** (Sonnet + Document Intelligence) — financial doc extraction
- **Reporting Agent** (Sonnet) — daily digest narrative

### 9.3 Data Model (initial)
- `users` — id, entra_oid, email, role, created_at
- `clio_tokens` — user_id, access_token_enc, refresh_token_enc, expires_at
- `matters` — clio_id, display_name, client_id, status, custom_fields_json
- `clients` — clio_id, name, aliases[]
- `matter_embeddings` — matter_id, embedding vector
- `email_summaries` — graph_message_id, user_id, matter_id, summary, importance, created_at
- `draft_proposals` — id, type (email/note/billing), payload_json, status (pending/approved/rejected), created_at
- `audit_log` — id, user_id, agent, model, tool, input_hash, output_hash, approved, created_at
- `agent_configs` — agent_name, version, prompt, model, params, active

### 9.4 Deterministic vs AI Boundaries
**Deterministic (code-only):** auth, token refresh, webhook signature verification, cron triggers, database writes, sending emails, Clio API writes, audit logging, rate limiting, fuzzy match scoring math.

**AI (Vercel AI SDK):** email classification, summarization, entity extraction, draft composition, intent recognition, matter candidate re-ranking, report narrative.

**Rule:** LLM produces Zod-validated structured proposals. Deterministic code executes. LLM never directly mutates external systems.

## 10. Success Metrics (Pilot)

| Metric | Target |
|---|---|
| Attorney hours saved/week | ≥10 hrs/user |
| Email triage precision | ≥90% (important not missed, non-important not over-flagged) |
| Matter resolution accuracy | ≥95% above 0.90 confidence; 0 wrong auto-attachments |
| Draft acceptance rate | ≥60% sent with minor edits, <10% rejected outright |
| Financial extraction accuracy | ≥95% field-level on standard paystubs |
| Daily digest engagement | ≥80% opened within 2 hours |
| Audit completeness | 100% of AI actions logged |

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong-matter attachment | Critical | High confidence threshold + HITL below + audit + undo |
| Hallucinated financial figures | Critical | Never auto-write; HITL preview every extracted value |
| Autonomous outbound action | Critical | Draft-only policy, no exceptions in V1 |
| Graph webhook expiration | High | Renewal cron every 24h + reconciliation polling |
| Clio rate limits | Medium | Token bucket + backoff; bulk sync paged |
| Token / credential compromise | Critical | Envelope encryption, short cache TTL, rotation runbook |
| Long-context token cost explosion | Medium | Embedding retrieval; per-matter monthly token budgets |
| Paystub OCR accuracy on weird formats | Medium | Always HITL preview; custom Doc Intelligence model after pilot data collected |
| CA Bar AI guidance evolution | Medium | Configurable disclosure copy; audit log export ready |
| Self-employed client documents | Medium | Flag for manual review; do not extract |

## 12. Open Items (to resolve during build)

- Court calendaring tool integration (V2 — LawToolBox vs CalendarRules)
- Conflict check process documentation from attorney
- Eval test set (~30 labeled emails + 20 sample financial docs)
- Engagement-letter AI disclosure language sign-off
- Azure subscription / Entra admin access path
- Vercel team setup and billing
- AI Gateway ZDR confirmation in writing from each provider

## 13. Phasing

**V1 (this PRD, ~3 months):** items F1–F10 above, pilot 1–3 users.

**V2 (next quarter):** Billing draft automation; OneDrive document *write* operations; workflow builder UI; conflict-check automation; LawToolBox/court calendaring integration; eval framework in admin UI.

**V3:** Multi-attorney rollout (RBAC); multi-agent orchestration; long-term memory / matter timeline retrieval; voice / mobile clients; SOC 2 Type II readiness.

## 14. Approvals

- [ ] Attorney sign-off on scope
- [ ] IT sign-off on Entra + Azure Bot registration path
- [ ] Clio admin sign-off on OAuth app registration
- [ ] Engagement-letter disclosure language ratified
- [ ] Audit-log retention policy confirmed
