# Teams Legal OS — Complete Setup Guide

> **What you're setting up:** an AI operational teammate that lives inside Microsoft Teams. It triages Outlook email, summarizes threads, finds the right Clio matter from fuzzy text, drafts replies into Outlook, and proposes Clio notes — with a human approving every external action.
>
> This guide takes a fresh copy of the project (cloned or downloaded from GitHub) and walks you all the way to **typing `ping` in Teams and getting `pong` back**, then turning on the real features (Clio + Outlook).

If you follow every step in order, you'll have a working install. Don't skip around — later steps depend on values you create in earlier ones.

---

## 0. Before you start — read this first

### 0.1 What it costs and how long it takes

| Resource | Free option? | Notes |
|---|---|---|
| Node.js + pnpm | Free | Local tooling |
| **Vercel** | Free (Hobby) | Hosting + crons + AI Gateway. Hobby works for a demo. |
| **Vercel AI Gateway** | Pay-as-you-go | You'll add a small amount of credit ($5 is plenty for a demo). |
| **Neon Postgres** | Free tier | Provisioned through Vercel in one click. |
| **Microsoft 365 tenant** | Free (Developer Program) | You need a tenant where **you are the admin**. See 0.3. |
| **Clio Manage** | Trial / Dev app | Optional for the basic demo. Full features (webhooks + custom fields, all set via the API) need a Clio **Pro** plan ($99/mo). |
| Azure Document Intelligence | Pay-as-you-go | **Not required.** Financial-document extraction (Phase 6) isn't built yet. |
| Langfuse | Free tier | Optional AI tracing. Skippable. |

**Realistic time:** ~60–90 minutes for the basic "bot says pong" path. Add ~45 min for full Clio + Outlook wiring.

### 0.2 The single most important rule: replace our domain everywhere

This project was originally built and deployed at a `*.vercel.app` domain that is **not yours**. When you deploy, Vercel gives you your *own* domain (e.g. `legal-os-yourname.vercel.app`).

You must replace our domain with **your** domain in **all** of these places:

1. `teams-app/manifest.json` → `validDomains`, `developer.*Url`
2. Your **Entra app** redirect URIs (sign-in + Graph callback)
3. The **Bot messaging endpoint** (Teams Developer Portal)
4. `CLIO_REDIRECT_URI` env var + the Clio app's redirect URI
5. `GRAPH_REDIRECT_URI` env var
6. Your **Clio webhook** URL (if using Clio Elite)

A checklist for this is in **Part 8**. Most "it doesn't work" problems trace back to a domain mismatch here.

### 0.3 Accounts you need to create up front

Create these now so you're not interrupted later:

- **A Microsoft 365 tenant where you are Global Administrator.** The easiest free path is the [Microsoft 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program) (gives you a tenant with test users). A Business trial also works. A *personal* `@outlook.com` account will **not** work — you need a tenant you can administer.
- **A Vercel account** — https://vercel.com/signup
- **A Clio account** (optional for basic demo) — https://www.clio.com . For API access you register a developer app in the Clio account settings.

---

## 1. Local prerequisites

You'll run everything from a **terminal**: on macOS open **Terminal** (Applications → Utilities → Terminal); on Windows use **PowerShell**. Grab a code editor too — **[VS Code](https://code.visualstudio.com)** is free and excellent.

Install the tools below **in order**. The macOS commands use **Homebrew** (the standard Mac package manager), so set that up first.

- **Homebrew** *(macOS only — skip if `brew --version` already works):*
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
  When it finishes, run the two **"Next steps"** commands it prints. On Apple-Silicon Macs that's the line starting `eval "$(/opt/homebrew/bin/brew shellenv)"` — it puts `brew` on your PATH. Verify with `brew --version`.

- **git** — needed to download the project:
  ```bash
  git --version          # if this already prints a version, skip the install
  brew install git       # macOS (may trigger Apple's "Command Line Tools" prompt — accept it)
  # Windows: install from https://git-scm.com/download/win
  ```

- **Node.js 20 LTS or newer** (Node 24 is fine):
  ```bash
  brew install node      # macOS
  # any OS: or download the LTS installer from https://nodejs.org
  ```

- **pnpm** (this project uses pnpm, not npm):
  ```bash
  npm install -g pnpm
  ```
- **Vercel CLI:**
  ```bash
  pnpm add -g vercel@latest
  ```
  > **First time using pnpm globally?** If you see `ERROR: The configured global bin directory ... is not in PATH`, pnpm hasn't wired its global bin folder into your shell yet. Fix it once:
  > ```bash
  > pnpm setup          # writes PNPM_HOME + PATH into your ~/.zshrc (or ~/.bashrc)
  > source ~/.zshrc     # reload your shell (or just open a new terminal tab)
  > pnpm add -g vercel@latest   # re-run the install
  > ```
  > Any `@pnpm/exe ... Failed to create bin` warnings during `pnpm setup` are harmless — that's pnpm trying to reinstall itself; your `vercel` install still works. Verify with `vercel --version`.
- *(Optional)* `uuidgen` for generating a Teams app ID later (Part 8) — it ships with macOS/Linux. On Windows use PowerShell's `[guid]::NewGuid()`.

Verify everything is installed:
```bash
git --version
node -v      # v20+
pnpm -v
vercel --version
```

---

## 2. Get the code and install

Pick **one** way to get the project onto your computer. Both finish with a **Terminal window open *inside* the project folder** — that's the goal. The steps below are click-by-click for **macOS**; raw commands are shown too so Windows/Linux users can follow.

### First, a trick you'll use a lot: open a Terminal *inside* a folder

The reliable way that needs no setup:
1. Open **Terminal** — press **⌘-Space**, type `Terminal`, press **Enter**.
2. Type `cd ` (the letters `c`, `d`, then a **space**) — *don't* press Enter yet.
3. **Drag the folder** from Finder/Desktop into the Terminal window. Its path appears automatically.
4. Press **Enter**. You're now "inside" that folder.

> Prefer right-clicking? You can enable **right-click a folder → New Terminal at Folder**: open **System Settings → Keyboard → Keyboard Shortcuts → Services → Files and Folders**, tick **New Terminal at Folder**. (It's off by default, which is why the drag trick above is the safe bet.)

### Option A — clone with git (recommended)

1. **Make a folder for your projects.** Right-click your **Desktop** → **New Folder** → name it `projects` (or anything).
2. **Open a Terminal inside that `projects` folder** using the drag trick above.
3. **Download the code** — paste this and press **Enter**:
   ```bash
   git clone https://github.com/YASAM1/ms-teams-legal-os.git
   ```
   This creates a new `ms-teams-legal-os` folder inside `projects`.
4. **Move into it:**
   ```bash
   cd ms-teams-legal-os
   ```

### Option B — download a ZIP (no git needed)

1. On the GitHub page, click the green **Code** button → **Download ZIP**.
2. The ZIP lands in your **Downloads** folder. **Double-click it** — macOS unzips it into a folder called `ms-teams-legal-os-main`.
3. *(Optional, tidier)* Right-click your **Desktop** → **New Folder**, then **drag** the unzipped `ms-teams-legal-os-main` folder onto the Desktop.
4. **Open a Terminal inside that unzipped folder** using the drag trick above.

### Then — install (both options)

With your Terminal sitting **inside the project folder**, run:
```bash
pnpm install
cp .env.example .env.local
```
> **Am I in the right folder?** Run `ls` and press Enter — you should see `package.json`, `SETUP.md`, and a `lib` folder listed. If you don't, you're not inside the project folder yet — redo the drag trick on the correct folder.

You'll fill in `.env.local` as you go. Keep it open in your editor. **Never commit `.env.local`** — it holds secrets.

> The app reads env vars through `lib/env.ts` (Zod-validated). Helper and verification scripts live in `scripts/` and are run with:
> ```bash
> pnpm exec dotenv -e .env.local -- tsx scripts/<name>.ts
> ```
> (`dotenv -e .env.local --` loads your local env before running the script.)

---

## 3. Generate your local secrets

These four values are generated by you — they don't come from any provider. Run these and paste the output into `.env.local`:

```bash
# AUTH_SECRET (Auth.js session signing)
openssl rand -base64 32

# ENCRYPTION_KEY (envelope encryption for stored Clio/Graph tokens)
openssl rand -hex 32

# CRON_SECRET (authorizes Vercel Cron calls)
openssl rand -hex 32
```

Fill in:
```ini
AUTH_SECRET="<rand base64>"
AUTH_TRUST_HOST=true
ENCRYPTION_KEY="<rand hex>"
CRON_SECRET="<rand hex>"
# Comma-separated emails allowed into the /admin page — use YOUR tenant login email
ADMIN_EMAIL_ALLOWLIST="you@yourtenant.onmicrosoft.com"
```

> There is a `scripts/seed-secrets.ts` helper that auto-generates these, but it has a hard-coded admin email — generate them manually as above instead, so the admin allowlist is yours.

---

## 4. Vercel: project, deploy, and database

### 4.1 Link the project
From the project root:
```bash
vercel login
vercel link
```
Choose: create a new project, name it whatever you like, code directory `./`, **don't** override settings (we ship `vercel.ts`).

### 4.2 Do a first deploy to claim your domain
```bash
vercel
```
This gives you a **preview URL**. Then promote to production to get your stable domain:
```bash
vercel --prod
```
Note the production domain it prints (e.g. `https://legal-os-yourname.vercel.app`). **This is "your domain" from §0.2.** Write it down — you'll use it everywhere.

> The build may show warnings until env vars and the DB exist. That's expected at this stage.

> **Simpler alternative — deploy from GitHub (recommended for beginners):** instead of running `vercel --prod` by hand every time, push this repo to GitHub and connect it to your Vercel project (Vercel dashboard → your project → **Settings → Git → Connect**). After that, **every `git push` auto-deploys** to production, and pull requests get their own preview URLs. You still set env vars once (Part 9). This is the easiest way to keep production up to date as you tweak things.

### 4.3 Provision Neon Postgres
In the **Vercel dashboard** → your project → **Storage** → **Create Database** → **Neon** → connect it to the project (all environments).

Vercel auto-injects the database connection string. The **only** value you need from Vercel is `DATABASE_URL` — everything else in `.env.local` you set by hand.

> ⚠️ **Do _not_ run `vercel env pull .env.local`.** That command **overwrites your entire `.env.local`**, wiping the secrets you just generated in Part 3 (and the template structure). Pulling at this stage would replace your file with only the database vars, and you'd lose `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, etc. Use the safe steps below instead.

**Safe way to grab just the database URL:**

1. Pull Vercel's variables into a **separate, temporary** file (note the filename — *not* `.env.local`):
   ```bash
   vercel env pull .env.vercel
   ```
2. Open **both** `.env.vercel` and your `.env.local` in your editor (VS Code). In `.env.vercel`, find the line starting with `DATABASE_URL=` and **copy its whole value** (the long `postgres://...` string).
3. In `.env.local`, paste that value over the `postgres://...` placeholder so the line becomes your real connection string:
   ```ini
   DATABASE_URL="postgres://...your real value pasted from .env.vercel..."
   ```
4. Delete the temporary file so it can't confuse you later:
   ```bash
   rm .env.vercel
   ```

> **Prefer clicking?** Instead of the CLI, open Vercel dashboard → your project → **Storage** → your database → the **`.env.local` / Quickstart** snippet, and copy the `DATABASE_URL` value straight into your `.env.local`. Same result, no temp file.

From here on, treat **`.env.local` as your single hand-edited source of truth** — you'll keep adding values to it as you go (Parts 6, 7, 11, 12). You won't `vercel env pull` again; later you push your values *up* to Vercel (Part 9).

### 4.4 Get an AI Gateway key
In the Vercel dashboard → **AI Gateway** → create an **API key**, and add a few dollars of credit. Put it in `.env.local`:
```ini
AI_GATEWAY_API_KEY="<your gateway key>"
```
The app calls Claude (Haiku/Sonnet/Opus) and OpenAI embeddings **through** the gateway — you don't need separate provider keys.

Quick test once the key is set:
```bash
pnpm exec dotenv -e .env.local -- tsx scripts/smoke-gateway.ts
```

---

## 5. Set up the database schema

With `DATABASE_URL` in `.env.local`, apply all migrations (this also enables the `pgvector` extension and creates the embeddings table):

```bash
pnpm exec dotenv -e .env.local -- drizzle-kit migrate
```

This creates all 12 tables plus the pgvector index. Verify:
```bash
pnpm exec dotenv -e .env.local -- tsx scripts/list-tables.ts
```

> If `pgvector` fails to enable, run once and re-migrate:
> ```bash
> psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
> ```
> Neon supports pgvector out of the box, so this is rarely needed.

---

## 6. Microsoft Entra app (Graph access + admin sign-in)

This is the identity the app uses for (a) admin SSO into `/admin` and (b) per-user Outlook access via Microsoft Graph.

1. Go to the [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `Teams Legal OS`. Supported account types: **Single tenant**. Click **Register**.
3. Copy the **Application (client) ID** and **Directory (tenant) ID** into `.env.local`:
   ```ini
   ENTRA_TENANT_ID="<directory/tenant id>"
   ENTRA_CLIENT_ID="<application/client id>"
   ```
4. **Certificates & secrets** → **New client secret** → copy the **Value** (not the ID):
   ```ini
   ENTRA_CLIENT_SECRET="<secret value>"
   ```
5. **Authentication** → **Add a platform** → **Web** → add these **Redirect URIs** (use **your** domain *and* localhost):
   - `https://YOUR-DOMAIN.vercel.app/api/auth/callback/microsoft-entra-id`  *(admin SSO)*
   - `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - `https://YOUR-DOMAIN.vercel.app/api/graph/oauth/callback`  *(Outlook connect)*
   - `http://localhost:3000/api/graph/oauth/callback`
6. Set the Graph redirect env var:
   ```ini
   GRAPH_REDIRECT_URI="https://YOUR-DOMAIN.vercel.app/api/graph/oauth/callback"
   ```
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions** → add:
   `User.Read`, `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`, `Files.ReadWrite.All`, `offline_access`, `openid`, `profile`, `email`.
   Then click **Grant admin consent for \<your tenant\>**.

---

## 7. Register the Teams bot (no Azure Bot resource needed)

We register the bot through the **Teams Developer Portal**, which avoids the Azure Bot Service paywall.

1. Go to [dev.teams.microsoft.com](https://dev.teams.microsoft.com) → **Tools** → **Bot management** → **New Bot**.
2. Name it (e.g. `Legal Ops`) and create it. Open it.
3. **Client secrets** → add a secret → copy the value.
4. **Configure** → set the **Endpoint address** to:
   `https://YOUR-DOMAIN.vercel.app/api/teams/messages`
5. Copy the **Bot ID** (a GUID). Fill in `.env.local`:
   ```ini
   BOT_APP_ID="<bot id>"
   BOT_APP_PASSWORD="<bot client secret>"
   BOT_APP_TYPE=SingleTenant
   BOT_APP_TENANT_ID="<your tenant id — same as ENTRA_TENANT_ID>"
   ```

> **Known gotcha (worth knowing in advance):** the Developer Portal may register the bot as **SingleTenant** in the Bot Framework Service. If your first Teams message fails with a 401 in the Vercel logs, make sure `BOT_APP_TYPE=SingleTenant` and `BOT_APP_TENANT_ID` is set to your tenant ID. (Switching between MultiTenant/SingleTenant is the usual fix.)

Smoke-test the adapter locally:
```bash
pnpm exec dotenv -e .env.local -- tsx scripts/smoke-bot-adapter.ts
```

---

## 8. Build and sideload the Teams app

The "manifest" is a little ID card that tells Teams about your app. You'll put four of your own values into it, bundle it into a `.zip`, and upload that to Teams.

### 8.1 Open the manifest file in your editor

1. Open **VS Code**.
2. **File → Open…**, then choose your project folder (the `ms-teams-legal-os` folder you've been working in) and click **Open**.
3. In the file list on the left, click the **`teams-app`** folder to expand it, then click **`manifest.json`** to open it.

You'll change four things. To jump to a piece of text, use **Edit → Find** (press **⌘F**) and paste in what you're looking for.

**Change 1 of 4 — your app's own unique ID**

This app needs a brand-new ID that belongs only to it. You'll generate one in Terminal:

1. Switch to your **Terminal** window (the one open *inside* your project folder — same one from Part 5; if you closed it, reopen it with the drag trick).
2. Type this and press **Enter**:
   ```bash
   uuidgen
   ```
3. It prints a line like `A1B2C3D4-5E6F-7890-ABCD-1234567890AB`. **Select that whole line and copy it** (⌘C).
4. Back in `manifest.json`, find this line near the top:
   ```json
   "id": "00000000-0000-0000-0000-000000000000",
   ```
   Replace the `00000000-0000-0000-0000-000000000000` (the part **between the quotes**) with the value you just copied. Leave the quotes and comma in place. (The capital letters are fine — don't change them.)

> ⚠️ **Heads-up — two lines look almost identical.** There are **two** lines in this file that read `00000000-0000-0000-0000-000000000000`. The one you just edited is `"id"` (your *app's* ID). The **other** one is `"botId"` and needs a **different** value — that's the very next step. Do **not** paste the same value into both.

**Change 2 of 4 — your Bot ID**

1. Find this line:
   ```json
   "botId": "00000000-0000-0000-0000-000000000000",
   ```
2. Replace the zeros (between the quotes) with the **Bot ID** you copied back in **Part 7, step 5**. Leave the quotes and comma in place.

**Change 3 of 4 — your website address (fixes 4 spots at once)**

The file mentions a placeholder web address, `your-domain.vercel.app`, in four places. Replace them all in one go:

1. Open **Edit → Replace** (press **⌥⌘F** — that's Option + Command + F). Two boxes appear at the top of the file.
2. In the **top** box, paste: `your-domain.vercel.app`
3. In the **bottom** box, type **your real Vercel address** — the same one you've used in earlier parts (for example `legal-ops-abc123.vercel.app`). Type it **without** `https://` and without any slashes.
4. Click the **Replace All** button (the icon with the two arrows, or press **⌘+Enter**). It should report 4 replacements.

**Change 4 of 4 — your firm's name (optional)**

Find `"name": "Your Company"` and change `Your Company` to your firm's name if you like. This only shows on the app's "About" page, so it's safe to skip.

**Now save the file:** press **⌘S**.

### 8.2 Bundle it into a zip

Teams wants the manifest plus two small icons packed into a single `.zip` file.

1. Go to your **Terminal** window (the one inside the project folder).
2. Copy-paste this whole block and press **Enter**:
   ```bash
   cd teams-app
   zip legal-ops.zip manifest.json color.png outline.png
   cd ..
   ```
3. You should see three lines that start with `adding:`. That means it worked — you now have a file called **`legal-ops.zip`** inside the `teams-app` folder.

> `color.png` and `outline.png` are placeholder icons that already ship in the folder, so this just works. Want your own logo later? Replace those two files (a 192×192-pixel `color.png` and a 32×32-pixel `outline.png`) and run the `zip` command again.

### 8.3 Upload the app into Teams

1. Open **Microsoft Teams**.
2. In the left rail, click **Apps**.
3. At the bottom of that panel, click **Manage your apps**.
4. Click **Upload an app**, then **Upload a custom app**.
5. In the file picker, go to your project folder → **`teams-app`** → choose **`legal-ops.zip`**.
6. When Teams shows the app card, click **Add**. It opens as a personal chat — that's where you'll talk to it.

---

## 9. Push env vars to Vercel and redeploy

Your bot endpoint lives on Vercel, so all the vars must exist there too. Push each one to all three environments:

```bash
# repeat for EVERY variable in your .env.local
vercel env add BOT_APP_ID production
vercel env add BOT_APP_ID preview
vercel env add BOT_APP_ID development
# ...and so on for all vars below
```

**Variables to set** (everything except the Vercel-managed `DATABASE_URL`, which is already there):

```
BOT_APP_ID, BOT_APP_PASSWORD, BOT_APP_TYPE, BOT_APP_TENANT_ID
ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, GRAPH_REDIRECT_URI
AUTH_SECRET, AUTH_TRUST_HOST, ADMIN_EMAIL_ALLOWLIST
ENCRYPTION_KEY, CRON_SECRET, AI_GATEWAY_API_KEY
CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, CLIO_REDIRECT_URI, CLIO_WEBHOOK_SECRET   (Part 11, optional)
LANGFUSE_*                                                                   (optional)
```

> **Faster than 50+ CLI commands:** you can paste all your variables at once in the **Vercel dashboard → your project → Settings → Environment Variables** (it accepts a bulk `.env` paste and lets you tick Production/Preview/Development). Either way works — the CLI loop below is fine if you prefer the terminal.

Then redeploy production so the bot endpoint picks them up:
```bash
vercel --prod
```
*(If you connected GitHub in §4.2, a `git push` redeploys instead.)*

---

## 10. ✅ First milestone — say hello to your bot

In the Teams chat with your app, type:
```
ping
```
You should get back **`pong`**.

If you do — **congratulations, the hard part is done.** The bot is live, authenticated, talking to Vercel, and the database is wired. Everything after this is turning on features.

**If `ping` doesn't return `pong`:** jump to **Troubleshooting** (§13) — it's almost always the messaging endpoint or the `BOT_APP_TYPE`/tenant setting.

---

## 11. (Optional) Connect Clio — matter search, notes, intake

Skip this if you just want the basic demo. Required for `/find-matter`, `/intake`, and Clio note approvals.

> Everything here — including webhooks and custom fields — is configured through the Clio API, so a Clio **Pro** plan ($99/mo) is enough to run the full feature set. (Read-only matter search + note creation work on lower tiers; webhooks/custom fields need Pro.)

1. In Clio → **Settings** → **Developer / App** (or the [Clio Developer Portal](https://app.clio.com/settings/developer_applications)) → create an app.
2. Set the **Redirect URI** to `https://YOUR-DOMAIN.vercel.app/api/clio/oauth/callback`.
3. Copy the client ID/secret into `.env.local` (and push to Vercel as in §9):
   ```ini
   CLIO_CLIENT_ID="<id>"
   CLIO_CLIENT_SECRET="<secret>"
   CLIO_REDIRECT_URI="https://YOUR-DOMAIN.vercel.app/api/clio/oauth/callback"
   CLIO_WEBHOOK_SECRET="<any strong random string you choose>"
   ```
4. Verify the OAuth config:
   ```bash
   pnpm exec dotenv -e .env.local -- tsx scripts/smoke-clio-oauth.ts
   ```
5. **Connect your Clio account:** go to `https://YOUR-DOMAIN.vercel.app/admin`, sign in with your Entra admin account (must be in `ADMIN_EMAIL_ALLOWLIST`), and click **Connect Clio**. Approve consent.
6. **Pull your Clio data and build the search index:**
   ```bash
   pnpm exec dotenv -e .env.local -- tsx scripts/run-clio-sync.ts
   pnpm exec dotenv -e .env.local -- tsx scripts/run-embed-matters.ts
   ```
7. Test in Teams:
   ```
   /find-matter smith v jones
   ```
   You should get ranked matter candidates with confidence scores.

---

## 12. (Optional) Connect Outlook — triage, summaries, drafts

Skip if you only want the basic demo. Required for email triage cards, `/summarize-thread`, `/draft-reply`, and `/draft-new`.

1. The Entra permissions from **Part 6** already cover this — no new app.
2. Go to `https://YOUR-DOMAIN.vercel.app/admin` → **Connect Outlook** → approve consent.
3. Create the inbox subscription (so new mail flows in):
   ```bash
   # POST to the subscriptions endpoint, or trigger from the admin page if exposed
   curl -X POST https://YOUR-DOMAIN.vercel.app/api/graph/subscriptions \
     -H "Cookie: <your authenticated admin session>"
   ```
   A reconciliation cron (`/api/cron/email-reconcile`, every 15 min) acts as a safety net even if the webhook lapses.
4. Send yourself a test email, wait up to ~60 seconds, and watch for a triage card in Teams. You can also force a triage drain:
   ```bash
   pnpm exec dotenv -e .env.local -- tsx scripts/smoke-triage-worker.ts
   ```

The four cron jobs are defined in `vercel.ts` and run automatically on Vercel:

| Cron | Schedule | Purpose |
|---|---|---|
| `clio-sync` | daily 09:00 UTC | Refresh Clio clients/matters |
| `graph-subscriptions-renew` | every 6h | Keep Graph webhooks alive |
| `email-reconcile` | every 15 min | Catch any missed emails |
| `daily-digest` | weekdays 06:30 PT | *(Phase 7 — not built yet)* |

---

## 13. Troubleshooting

**`ping` returns nothing in Teams**
- Confirm the bot **Endpoint address** is exactly `https://YOUR-DOMAIN.vercel.app/api/teams/messages` (your domain, with `https://`).
- Check Vercel → your project → **Logs** while you send the message. A `401` from the outbound Bot Framework call means `BOT_APP_TYPE`/`BOT_APP_TENANT_ID` is wrong — set `SingleTenant` + your tenant ID (§7 gotcha).
- Make sure you redeployed (`vercel --prod`) **after** adding the `BOT_APP_*` vars.

**Can't get into `/admin`**
- Your sign-in email must be listed in `ADMIN_EMAIL_ALLOWLIST` (and that var must be set on Vercel).
- The Entra redirect URI `.../api/auth/callback/microsoft-entra-id` must match your domain exactly.

**Clio/Outlook "connect" fails or redirect error**
- The redirect URI registered on the provider app must match the env var **character-for-character**, including `https://` and no trailing slash.

**`drizzle-kit migrate` errors on the vector type**
- Enable pgvector once: `psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"` then re-run migrate.

**AI calls fail**
- Run `scripts/smoke-gateway.ts`. Usually the `AI_GATEWAY_API_KEY` is missing on Vercel or the gateway has no credit.

**General principle:** when something breaks, open **Vercel → Logs**, reproduce the action, and read the error. The app writes structured logs (with PII redacted) for every step.

---

## 14. What's included vs. what's not (be honest in your demo)

**Working today (Phases 1–5):**
- Teams bot + slash commands (`/find-matter`, `/summarize-thread`, `/intake`, `/draft-reply`, `/draft-new`, `ping`)
- Clio sync, fuzzy matter resolution (hybrid search + LLM re-rank, confidence tiers)
- Outlook email triage → proactive Teams cards
- Clio note approval (human-in-the-loop) + new-matter intake
- Outlook draft generation into the Drafts folder
- Append-only audit log, envelope-encrypted tokens, PII redaction

**Not built yet (don't promise these):**
- **Financial document extraction** (Phase 6 — Azure Document Intelligence). No code yet; you don't need an Azure DI resource.
- **Daily digest reports** (Phase 7 — the `daily-digest` cron will 404 until built).
- **Full admin UI** for editing prompts/config (Phase 8 — minimal admin page exists for connecting Clio/Outlook).
- Capturing attorney edits to fine-tune drafts (Phase 5.7).

---

## 15. Quick reference — env var checklist

Tick these off in `.env.local` **and** on Vercel (all three environments):

```
[ ] DATABASE_URL            ← copy from Vercel into .env.local (don't `env pull` over the whole file — see §4.3)
[ ] AI_GATEWAY_API_KEY      ← Vercel AI Gateway
[ ] AUTH_SECRET             ← openssl rand -base64 32
[ ] AUTH_TRUST_HOST=true
[ ] ENCRYPTION_KEY          ← openssl rand -hex 32
[ ] CRON_SECRET             ← openssl rand -hex 32
[ ] ADMIN_EMAIL_ALLOWLIST   ← your admin email(s)
[ ] BOT_APP_ID / BOT_APP_PASSWORD / BOT_APP_TYPE / BOT_APP_TENANT_ID
[ ] ENTRA_TENANT_ID / ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET
[ ] GRAPH_REDIRECT_URI
[ ] CLIO_CLIENT_ID / CLIO_CLIENT_SECRET / CLIO_REDIRECT_URI / CLIO_WEBHOOK_SECRET   (optional)
[ ] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL                   (optional)
```

You're done. Type `ping` in Teams and start exploring.
