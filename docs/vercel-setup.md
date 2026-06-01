# Vercel Setup (one-time, user action required)

These steps require your Vercel account and cannot be automated by Claude. Run them once.

## 1. Install Vercel CLI (latest)

```bash
pnpm add -g vercel@latest
```

## 2. Authenticate

```bash
vercel login
```

## 3. Link this directory to a Vercel project

From the project root (`ms-teams-legal-os/`):

```bash
vercel link
```

Choose:
- Set up and deploy: **yes**
- Scope: your team or personal
- Link to existing project: **no** (creates new)
- Project name: `ms-teams-legal-os` (or whatever you prefer)
- In which directory is your code located: `./`
- Override settings: **no** (we have `vercel.ts`)

This writes `.vercel/project.json` (already gitignored by Next.js defaults — add `.vercel` to `.gitignore` if not present).

## 4. First deploy (preview)

```bash
vercel
```

This produces a preview URL. Production deploys happen on `main`-branch pushes once a Git integration is set up.

## 5. Connect Git (recommended)

In the Vercel dashboard for the project → Settings → Git → connect to a GitHub repo. After that:

- Every PR → preview deployment
- Every push to `main` → production deployment

## 6. Environment variables

We'll provision these in later tasks. The pattern is:

```bash
vercel env add <NAME> production
vercel env add <NAME> preview
vercel env add <NAME> development
vercel env pull .env.local
```

A full list is maintained in `docs/env-vars.md` (created when we have something to populate).

## 7. Provision Neon Postgres (task 1.3)

In the Vercel dashboard → Storage → Create Database → Neon → Connect.

Vercel auto-injects `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and Neon-specific variables into the project. Run `vercel env pull .env.local` afterward to bring them down.

Then enable pgvector:

```bash
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
