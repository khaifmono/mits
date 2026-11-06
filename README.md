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

`.github/workflows/deploy.yml` deploys **both** the site and the worker to Cloudflare on every push to `main`. Jobs self-skip until the secrets below exist.

One-time setup (repo `khaifmono/mits`):

```bash
# Cloudflare API token — dashboard → My Profile → API Tokens → Create Token,
# template "Edit Cloudflare Workers", then ADD permission "Cloudflare Pages: Edit", account resources → your account
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID     # dashboard → Workers & Pages → right sidebar "Account ID"

# Build-time variables (vars, not secrets)
gh variable set PUBLIC_SUGGEST_API_URL="https://mits-suggest.<your-subdomain>.workers.dev"
gh variable set PUBLIC_REPO_URL="https://github.com/khaifmono/mits"
```

After that: `git push` = deployed. PRs that touch `data/tools.json` additionally run the validator (`validate.yml`).

Local deploys work too, since `wrangler login` is already authorized:

```bash
cd worker && npx wrangler deploy          # worker
pnpm build && npx wrangler pages deploy dist --project-name=mits   # site
```

**Alternative** — Cloudflare Workers Builds: in the dashboard, Workers & Pages → connect the repo, root directory `worker`, deploy command `npx wrangler deploy`. Use this instead of the Actions job if you prefer dashboard-managed builds.

## Domain

Point `mits.my` at the Pages project: dashboard → Workers & Pages → `mits` → Custom domains → add `mits.my` (zone must be on Cloudflare).

## Adding a tool

Entries follow the schema in `CONTRIBUTING.md`. Validate locally with `pnpm validate`.
