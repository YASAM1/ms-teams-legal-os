# Teams Legal OS

An AI operational teammate that lives inside **Microsoft Teams** for a California family-law / plaintiff-side firm. It triages Outlook email, summarizes threads, finds the right Clio matter from fuzzy text, drafts replies into Outlook, and proposes Clio notes & new-matter intake — with a human approving **every** external action (drafts-only / human-in-the-loop).

> **New here? Setup lives in [`SETUP.md`](./SETUP.md)** — a step-by-step guide that takes a fresh clone all the way to typing `ping` in Teams and getting `pong` back, then turning on Clio + Outlook.

---

## What it does (working today)

- **Teams bot + slash commands:** `ping`, `/find-matter`, `/summarize-thread`, `/draft-reply`, `/draft-new`, `/intake`, `/today`
- **Fuzzy matter resolution** — hybrid search (Postgres BM25 + pgvector cosine) + LLM re-rank, with confidence tiers and learned aliases
- **Outlook email triage** → proactive Teams cards for urgent/actionable mail
- **Clio notes (HITL)** — approve an email-derived note from a Teams card; it lands in Clio
- **New-matter intake** — extract client/matter fields from free text → approve → create in Clio
- **Outlook draft generation** — matter-grounded reply drafts saved to your Drafts folder
- **`/today`** — pulls today's Clio calendar + open/overdue tasks + last-24h important emails and returns a prioritized 🔴/🟡/🟢 plan
- **Safety throughout** — append-only audit log, envelope-encrypted tokens (AES-256-GCM), PII redaction before LLM calls, per-matter token budgets

## Not built yet

- Financial-document extraction (Phase 6 — Azure Document Intelligence)
- Daily digest cron (Phase 7 — the on-demand `/today` exists; the 06:30 PT push does not)
- Full admin UI for editing prompts/config (Phase 8 — a minimal admin page exists for connecting Clio/Outlook)

See [`active/prd/current_task_list.md`](./active/prd/current_task_list.md) for the full phase-by-phase status and [`active/prd/CURRENT_PRD.md`](./active/prd/CURRENT_PRD.md) for the product spec.

## Tech stack

| Layer | Choice |
|---|---|
| Hosting | Vercel (Next.js 16 App Router, Fluid Compute) |
| Teams | Bot Framework SDK v4, registered via Teams Developer Portal |
| Identity | Microsoft Entra ID (Auth.js v5 for admin SSO) |
| AI | Vercel AI SDK v6 via Vercel AI Gateway — Claude Haiku/Sonnet/Opus + OpenAI embeddings |
| Database | Neon Postgres (Vercel Marketplace) + pgvector, Drizzle ORM |
| Integrations | Microsoft Graph (Outlook/OneDrive), Clio Manage API |

## Repo map

```
app/            Next.js routes — /admin (gated) + /api/* (bot, webhooks, OAuth, cron)
lib/            Domain logic — bot/, clio/, graph/, email/, today/, ai/
db/             Drizzle schema + migrations
scripts/        Setup helpers + smoke tests (run with: pnpm exec dotenv -e .env.local -- tsx scripts/<name>.ts)
teams-app/      Teams app manifest + icons (sideload package)
active/prd/     Product requirements + live task list
```

## Quick start

```bash
pnpm install
cp .env.example .env.local      # then fill it in — see SETUP.md
pnpm exec dotenv -e .env.local -- drizzle-kit migrate
pnpm dev
```

Full instructions — including Vercel, the database, the Entra app, the Teams bot, and connecting Clio/Outlook — are in **[`SETUP.md`](./SETUP.md)**.

---

*Drafts-only by design: the agent never sends email, posts billing, or writes to Clio without explicit human approval.*
