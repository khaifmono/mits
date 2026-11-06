# Contributing a tool

1. Fork, edit `data/tools.json`, add one object.
2. `node scripts/validate-tools.mjs` (or `pnpm validate`) — must pass.
3. Open a PR. CI validates again; merge auto-deploys.

## Schema

| Field                 | Type                          | Rules                                                                 |
| --------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `id`                  | string                        | kebab-case slug, unique — also the `/tool/<id>` URL                    |
| `name`                | string                        | display name                                                          |
| `tagline`             | string                        | one line, ≤120 chars                                                  |
| `description`         | string                        | 2–3 sentences: what it does + why it's sovereign                      |
| `category`            | enum                          | `PaaS & Containers` · `Identity & Auth` · `Observability & Uptime` · `Storage & Sync` · `Developer Tools` · `Local AI` · `Office & Knowledge` |
| `alternativeTo`       | string[]                      | proprietary SaaS it replaces, ≥1 entry                                |
| `repoUrl`             | string \| null                | public source, or `null` for download-only products                   |
| `siteUrl`             | string                        | official site (https)                                                 |
| `license`             | string \| null                | SPDX-style (`MIT`, `Apache-2.0`, `AGPL-3.0`…) or `null`               |
| `independenceLevel`   | enum                          | `100% Sovereign` · `Federated` · `Open Core`                          |
| `resourceRequirement` | enum                          | `Light (<512MB RAM)` · `Medium (1-2GB RAM)` · `Heavy (4GB+ RAM)`      |
| `featured`            | boolean                       | shown on the home grid first                                          |
| `dockerCompose`       | string \| null                | ready-to-copy minimal `docker-compose.yml`, or `null` for native apps |
| `addedAt`             | string                        | ISO date `YYYY-MM-DD` — drives "Recently Added" sort                  |
| `independence`        | optional object               | `{ dataFormat, telemetry, offline }` — the "Why it's independent" breakdown |

Keep compose snippets minimal and copy-pasteable; prefer `${VAR:?hint}` syntax so missing secrets fail loudly.
