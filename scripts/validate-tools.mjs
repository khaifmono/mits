#!/usr/bin/env node
// Validates data/tools.json schema. Run in CI on every PR that touches it.
// Mirrors src/lib/tools.ts enums — keep both in sync.
import { readFileSync } from 'node:fs';

const CATEGORIES = [
  'PaaS & Containers',
  'Identity & Auth',
  'Observability & Uptime',
  'Storage & Sync',
  'Developer Tools',
  'Local AI',
  'Office & Knowledge',
];
const INDEPENDENCE_LEVELS = ['100% Sovereign', 'Federated', 'Open Core'];
const RESOURCE_REQUIREMENTS = [
  'Light (<512MB RAM)',
  'Medium (1-2GB RAM)',
  'Heavy (4GB+ RAM)',
];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
let tools;
try {
  tools = JSON.parse(readFileSync(new URL('../data/tools.json', import.meta.url), 'utf8'));
} catch (e) {
  console.error(`tools.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(tools) || tools.length === 0) {
  console.error('tools.json must be a non-empty array');
  process.exit(1);
}

const seen = new Set();
for (const t of tools) {
  const at = (f, cond, msg) => {
    if (!cond) errors.push(`[${t.id ?? '?'}] ${f}: ${msg}`);
  };
  at('id', typeof t.id === 'string' && SLUG_RE.test(t.id), 'must be a kebab-case slug');
  at('id', !seen.has(t.id), 'duplicate id');
  seen.add(t.id);
  for (const f of ['name', 'tagline', 'description']) {
    at(f, typeof t[f] === 'string' && t[f].length > 0, 'required non-empty string');
  }
  at('tagline', typeof t.tagline === 'string' && t.tagline.length <= 120, 'keep under 120 chars');
  at('category', CATEGORIES.includes(t.category), `must be one of: ${CATEGORIES.join(' | ')}`);
  at(
    'alternativeTo',
    Array.isArray(t.alternativeTo) && t.alternativeTo.length > 0 && t.alternativeTo.every((a) => typeof a === 'string' && a.length > 0),
    'required non-empty string array (the proprietary SaaS it replaces)',
  );
  at('siteUrl', typeof t.siteUrl === 'string' && URL_RE.test(t.siteUrl), 'required http(s) URL');
  at('repoUrl', t.repoUrl === null || (typeof t.repoUrl === 'string' && URL_RE.test(t.repoUrl)), 'http(s) URL or null');
  at('license', t.license === null || (typeof t.license === 'string' && t.license.length > 0), 'SPDX-style string or null');
  at('independenceLevel', INDEPENDENCE_LEVELS.includes(t.independenceLevel), `must be one of: ${INDEPENDENCE_LEVELS.join(' | ')}`);
  at('resourceRequirement', RESOURCE_REQUIREMENTS.includes(t.resourceRequirement), `must be one of: ${RESOURCE_REQUIREMENTS.join(' | ')}`);
  at('featured', typeof t.featured === 'boolean', 'required boolean');
  at('dockerCompose', t.dockerCompose === null || typeof t.dockerCompose === 'string', 'compose YAML string or null');
  at('addedAt', typeof t.addedAt === 'string' && DATE_RE.test(t.addedAt) && !Number.isNaN(Date.parse(t.addedAt)), 'required ISO date (YYYY-MM-DD)');
  if (t.independence !== undefined) {
    for (const f of ['dataFormat', 'telemetry', 'offline']) {
      at(`independence.${f}`, typeof t.independence?.[f] === 'string' && t.independence[f].length > 0, 'required when independence block is present');
    }
  }
}

if (errors.length > 0) {
  console.error(`tools.json INVALID — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`tools.json OK — ${tools.length} tools, schema valid.`);
