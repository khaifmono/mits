// MITS suggestion intake — Cloudflare Worker.
// POST /suggest            -> append a suggestion to KV (public, rate-limited)
// GET  /suggest            -> list suggestions (admin token or session)
// DELETE /suggest?id=…     -> remove a suggestion (admin token or session)
// POST /admin/login        -> email/password -> 7-day session (secrets: ADMIN_EMAIL, ADMIN_PASSWORD)
// POST /admin/accept       -> commit entry to data/tools.json via GitHub + clear queue entry
//                             (session; secrets: GITHUB_TOKEN, optional GITHUB_REPO)

export interface Env {
  SUGGESTIONS: KVNamespace;
  ADMIN_TOKEN?: string; // script access (curl); dashboard uses email/password sessions
  ADMIN_EMAIL?: string; // set via dashboard secrets
  ADMIN_PASSWORD?: string;
  GITHUB_TOKEN?: string; // PAT with Contents: Read & write on GITHUB_REPO
  GITHUB_REPO?: string; // default khaifmono/mits
  ALLOWED_ORIGINS?: string;
}

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

const CATEGORIES = ['PaaS & Containers', 'Identity & Auth', 'Observability & Uptime', 'Storage & Sync', 'Developer Tools', 'Local AI', 'Office & Knowledge'];
const INDEPENDENCE_LEVELS = ['100% Sovereign', 'Federated', 'Open Core'];
const RESOURCE_REQUIREMENTS = ['Light (<512MB RAM)', 'Medium (1-2GB RAM)', 'Heavy (4GB+ RAM)'];

async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const admin = request.headers.get('x-admin-token');
  if (env.ADMIN_TOKEN && admin === env.ADMIN_TOKEN) return true;
  const session = request.headers.get('x-session');
  if (session && (await env.SUGGESTIONS.get(`sess:${session}`))) return true;
  return false;
}

interface ToolEntry {
  id: string; name: string; tagline: string; description: string; category: string;
  alternativeTo: string[]; repoUrl: string | null; siteUrl: string; license: string | null;
  independenceLevel: string; resourceRequirement: string; featured: boolean;
  dockerCompose: string | null; addedAt: string;
}

function parseEntry(raw: unknown): { entry: ToolEntry; errors: string[] } {
  const errors: string[] = [];
  const v = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (key: string): string => (typeof v[key] === 'string' ? (v[key] as string) : '');
  const id = str('id');
  const name = str('name');
  const tagline = str('tagline');
  const description = str('description');
  const category = str('category');
  const siteUrl = str('siteUrl');
  const independenceLevel = str('independenceLevel');
  const resourceRequirement = str('resourceRequirement');
  const addedAt = str('addedAt');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push('id must be a kebab-case slug');
  for (const [key, value] of [['name', name], ['tagline', tagline], ['description', description]] as const) {
    if (!value) errors.push(`${key} is required`);
  }
  const alternativeTo = Array.isArray(v.alternativeTo) ? v.alternativeTo.filter((a): a is string => typeof a === 'string' && a.length > 0) : [];
  if (alternativeTo.length === 0) errors.push('alternativeTo must be a non-empty string array');
  if (!/^https?:\/\/\S+$/.test(siteUrl)) errors.push('siteUrl must be an http(s) URL');
  const repoUrl = typeof v.repoUrl === 'string' && v.repoUrl.length > 0 ? v.repoUrl : null;
  if (repoUrl !== null && !/^https?:\/\/\S+$/.test(repoUrl)) errors.push('repoUrl must be an http(s) URL or null');
  const license = typeof v.license === 'string' && v.license.length > 0 ? v.license : null;
  if (!CATEGORIES.includes(category)) errors.push('invalid category');
  if (!INDEPENDENCE_LEVELS.includes(independenceLevel)) errors.push('invalid independenceLevel');
  if (!RESOURCE_REQUIREMENTS.includes(resourceRequirement)) errors.push('invalid resourceRequirement');
  const featured = v.featured === true;
  const dockerCompose = typeof v.dockerCompose === 'string' && v.dockerCompose.length > 0 ? v.dockerCompose : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(addedAt)) errors.push('addedAt must be YYYY-MM-DD');
  return {
    entry: { id, name, tagline, description, category, alternativeTo, repoUrl, siteUrl, license, independenceLevel, resourceRequirement, featured, dockerCompose, addedAt },
    errors,
  };
}

const json = (data: unknown, status = 200, origin?: string | null): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(origin ? { 'access-control-allow-origin': origin } : {}),
    },
  });

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (!env.ALLOWED_ORIGINS) return origin; // unset = permissive (local dev)
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .includes(origin)
    ? origin
    : null;
}

const clamp = (v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.slice(0, max);
};

interface Suggestion {
  id: string;
  name: string;
  url: string;
  replaces: string;
  category: string;
  notes: string;
  contact: string;
  ts: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 204 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, x-admin-token, x-session',
          'access-control-max-age': '86400',
        },
      });
    }

    if (url.pathname === '/admin/login' && request.method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const rlKey = `rllogin:${ip}`;
      const attempts = parseInt((await env.SUGGESTIONS.get(rlKey)) ?? '0', 10);
      if (attempts >= 20) return json({ error: 'too many attempts — try again in 15 minutes' }, 429, origin);
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400, origin);
      }
      if (typeof body !== 'object' || body === null) {
        return json({ error: 'invalid JSON body' }, 400, origin);
      }
      if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
        return json({ error: 'login not configured on this worker' }, 503, origin);
      }
      const ok = body.email === env.ADMIN_EMAIL && body.password === env.ADMIN_PASSWORD;
      if (!ok) {
        // only failed attempts count toward the limit
        await env.SUGGESTIONS.put(rlKey, String(attempts + 1), { expirationTtl: 900 });
        return json({ error: 'invalid email or password' }, 401, origin);
      }
      await env.SUGGESTIONS.delete(rlKey); // successful sign-in resets the counter
      const session = crypto.randomUUID();
      await env.SUGGESTIONS.put(`sess:${session}`, JSON.stringify({ ts: Date.now() }), { expirationTtl: SESSION_TTL });
      return json({ ok: true, session }, 200, origin);
    }

    if (url.pathname === '/admin/accept' && request.method === 'POST') {
      if (!(await isAuthed(request, env))) return json({ error: 'unauthorized' }, 401, origin);
      if (!env.GITHUB_TOKEN) return json({ error: 'GitHub token not configured on this worker' }, 503, origin);
      const repo = env.GITHUB_REPO ?? 'khaifmono/mits';
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid JSON body' }, 400, origin);
      }
      if (typeof body !== 'object' || body === null || !('entry' in body) || !('suggestionId' in body)) {
        return json({ error: 'entry and suggestionId are required' }, 400, origin);
      }
      const { entry, errors: entryErrors } = parseEntry(body.entry);
      if (entryErrors.length > 0) return json({ error: entryErrors.join(' · ') }, 400, origin);
      const suggestionId = body.suggestionId;
      if (typeof suggestionId !== 'string' || !suggestionId) {
        return json({ error: 'suggestionId must be a string' }, 400, origin);
      }

      const ghHeaders = {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'mits-admin',
        ...(request.method === 'PUT' ? { 'content-type': 'application/json' } : {}),
      };
      const get = await fetch(`https://api.github.com/repos/${repo}/contents/data/tools.json?ref=main`, { headers: ghHeaders });
      if (!get.ok) {
        const detail = (await get.json().catch(() => ({}))) as { message?: string };
        return json({ error: `GitHub GET failed: ${get.status} ${detail.message ?? ''}` }, 502, origin);
      }
      const meta: unknown = await get.json();
      if (
        typeof meta !== 'object' || meta === null ||
        !('sha' in meta) || typeof meta.sha !== 'string' ||
        !('content' in meta) || typeof meta.content !== 'string'
      ) {
        return json({ error: 'unexpected GitHub file response' }, 502, origin);
      }
      const current = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(meta.content), (c) => c.charCodeAt(0)))) as ToolEntry[];
      if (current.some((t) => t.id === entry.id)) {
        return json({ error: `id "${entry.id}" already exists in tools.json` }, 409, origin);
      }
      current.push(entry);
      const put = await fetch(`https://api.github.com/repos/${repo}/contents/data/tools.json`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `accept suggestion: ${entry.name}`,
          content: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(current, null, 2)))),
          sha: meta.sha,
          branch: 'main',
        }),
      });
      if (!put.ok) {
        const detail = (await put.json().catch(() => ({}))) as { message?: string };
        return json({ error: `GitHub PUT failed: ${put.status} ${detail.message ?? ''}` }, 502, origin);
      }
      const putResp: unknown = await put.json();
      let commitSha = '';
      if (typeof putResp === 'object' && putResp !== null && 'commit' in putResp) {
        const commit = putResp.commit;
        if (typeof commit === 'object' && commit !== null && 'sha' in commit && typeof commit.sha === 'string') {
          commitSha = commit.sha;
        }
      }
      if (!commitSha) return json({ error: 'GitHub PUT returned no commit' }, 502, origin);
      const queue = await env.SUGGESTIONS.list({ prefix: 'sugg:', limit: 200 });
      for (const k of queue.keys) {
        const s = await env.SUGGESTIONS.get<Suggestion>(k.name, 'json');
        if (s?.id === suggestionId) await env.SUGGESTIONS.delete(k.name);
      }
      return json({ ok: true, commit: commitSha }, 200, origin);
    }

    if (url.pathname !== '/suggest') return json({ error: 'not found' }, 404, origin);

    if (request.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: 'invalid JSON body' }, 400, origin);
      }

      // Honeypot — bots fill hidden fields. Pretend success, store nothing.
      if (clamp(body.website, 10)) return json({ ok: true }, 201, origin);

      const name = clamp(body.name, 120);
      if (!name) return json({ error: 'name is required (max 120 chars)' }, 400, origin);

      let urlField = '';
      if (body.url != null && body.url !== '') {
        try {
          const parsed = new URL(clamp(body.url, 500));
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme');
          urlField = parsed.toString();
        } catch {
          return json({ error: 'url must be a valid http(s) URL' }, 400, origin);
        }
      }

      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const rlKey = `rl:${ip}`;
      const count = parseInt((await env.SUGGESTIONS.get(rlKey)) ?? '0', 10);
      if (count >= 5) {
        return json({ error: 'rate limited — max 5 suggestions per hour' }, 429, origin);
      }
      await env.SUGGESTIONS.put(rlKey, String(count + 1), { expirationTtl: 3600 });

      const suggestion: Suggestion = {
        id: crypto.randomUUID(),
        name,
        url: urlField,
        replaces: clamp(body.replaces, 200),
        category: clamp(body.category, 60),
        notes: clamp(body.notes, 2000),
        contact: clamp(body.contact, 200),
        ts: Date.now(),
      };
      const key = `sugg:${new Date(suggestion.ts).toISOString()}:${suggestion.id}`;
      await env.SUGGESTIONS.put(key, JSON.stringify(suggestion));
      return json({ ok: true, id: suggestion.id }, 201, origin);
    }

    if (request.method === 'DELETE') {
      if (!(await isAuthed(request, env))) {
        return json({ error: 'unauthorized' }, 401, origin);
      }
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id query param required' }, 400, origin);
      const list = await env.SUGGESTIONS.list({ prefix: 'sugg:', limit: 200 });
      for (const k of list.keys) {
        const s = await env.SUGGESTIONS.get<Suggestion>(k.name, 'json');
        if (s?.id === id) {
          await env.SUGGESTIONS.delete(k.name);
          return json({ ok: true, deleted: id }, 200, origin);
        }
      }
      return json({ error: 'not found' }, 404, origin);
    }

    if (request.method === 'GET') {
      if (!(await isAuthed(request, env))) {
        return json({ error: 'unauthorized' }, 401, origin);
      }
      const list = await env.SUGGESTIONS.list({ prefix: 'sugg:', limit: 200 });
      const suggestions = (
        await Promise.all(list.keys.map((k) => env.SUGGESTIONS.get<Suggestion>(k.name, 'json')))
      )
        .filter((s): s is Suggestion => s !== null)
        .sort((a, b) => b.ts - a.ts);
      return json({ suggestions, truncated: list.list_complete === false }, 200, origin);
    }

    return json({ error: 'method not allowed' }, 405, origin);
  },
};
