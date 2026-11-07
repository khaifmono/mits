# MITS — More Independent Toolset & Software

Curated directory of open-source, self-hostable and sovereign software. Live at `mits.my`.

## Stack

- Astro 5 + Tailwind CSS 4, zero client framework — filters/search/sort are a small vanilla TS script over server-rendered cards.
- Data: `data/tools.json` (single source of truth, no database).
- Icons: `lucide-astro`.

## Quickstart

```bash
pnpm install
cp .env.example .env      # points PUBLIC_SUGGEST_API_URL at the local worker
pnpm dev                  # http://localhost:4321
```

Run the intake worker locally (separate terminal):

```bash
cd worker
npx wrangler dev          # http://localhost:8787 — local KV simulation, no account needed
```

## How new tools arrive (the intake pipeline)

Every path ends in `data/tools.json`; merges auto-deploy the static site.

1. **Suggestion form** (`/submit`) — POSTs to the Cloudflare Worker (`worker/`), which stores entries in KV. Maintainer reads them with `curl -H "x-admin-token: …" https://<worker>/suggest` and promotes the good ones.
2. **GitHub issue** — structured template (`.github/ISSUE_TEMPLATE/tool-suggestion.yml`) renders normalized suggestions.
3. **Pull request** — edit `data/tools.json` directly; CI (`.github/workflows/validate.yml`) runs `node scripts/validate-tools.mjs` on every PR touching it. Invalid entries cannot merge.

## Deploy — commit → auto-update

**Account note:** `mits.my` (plus azkhai.com, khaif.dev, mvsdev.com) lives in the **personal** Cloudflare account. Production runs there via Workers Builds (GitHub-connected) — never deploy mits to KESATRIA AWAN / KA-Clients; those hold business and client domains only.

`.github/workflows/deploy.yml` deploys **both** the site (Worker + static assets) and the suggest worker to Cloudflare on every push to `main`. Jobs self-skip until the secrets below exist — when setting them, use the **personal** account's token and account ID.

One-time setup (repo `khaifmono/mits`):

```bash
# Cloudflare API token — dashboard → My Profile → API Tokens → Create Token,
# template "Edit Cloudflare Workers", account resources → your account
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID     # dashboard → Workers & Pages → right sidebar "Account ID"

# Build-time variables (vars, not secrets)
gh variable set PUBLIC_SUGGEST_API_URL="https://mits-suggest.kesatria-awan.workers.dev"
gh variable set PUBLIC_REPO_URL="https://github.com/khaifmono/mits"
```

After that: `git push` = deployed. PRs that touch `data/tools.json` additionally run the validator (`validate.yml`).

Local deploys work too, since `wrangler login` is already authorized:

```bash
npx wrangler deploy            # site (root wrangler.jsonc — binds mits.my via custom_domain routes)
cd worker && npx wrangler deploy   # suggest worker
```

## Domain

`mits.my` / `www.mits.my` are declared as `custom_domain` routes in the root `wrangler.jsonc` and bind automatically on deploy — the `mits.my` zone must be on this Cloudflare account. Both origins are already in the suggest worker's `ALLOWED_ORIGINS`.

## Admin — accepting suggestions

**`mits.my/admin`** (unlisted, `noindex`). Paste two tokens once — both stay in your browser's localStorage:

- **Admin token** — the suggest worker's `ADMIN_TOKEN` (reads/deletes the queue)
- **GitHub token** — PAT with **Contents: Read & write** on `khaifmono/mits` (commits accepted entries). Your existing `gh auth token` works.

Flow per suggestion: **Accept → commit** opens a prefilled editor (fill tagline/description/license/…) → **Commit to data/tools.json** commits via the GitHub API → Workers Builds auto-deploys → **Delete** clears the queue entry. Or **Copy JSON** and do it manually. The page validates the entry against the schema before committing; CI re-validates.

The queue API: `GET /suggest` lists, `DELETE /suggest?id=…` removes — both require the `x-admin-token` header.

## Adding a tool

Entries follow the schema in `CONTRIBUTING.md`. Validate locally with `pnpm validate`.
