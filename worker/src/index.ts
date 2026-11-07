// MITS suggestion intake — Cloudflare Worker.
// POST /suggest  -> append a suggestion to KV (public, rate-limited)
// GET  /suggest  -> list suggestions (requires x-admin-token header)

export interface Env {
  SUGGESTIONS: KVNamespace;
  ADMIN_TOKEN?: string; // set via: wrangler secret put ADMIN_TOKEN
  ALLOWED_ORIGINS?: string; // comma-separated, e.g. "https://mits.my,http://localhost:4321"
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
          'access-control-allow-methods': 'POST, GET, OPTIONS',
          'access-control-allow-headers': 'content-type, x-admin-token',
          'access-control-max-age': '86400',
        },
      });
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
      if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
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
      if (!env.ADMIN_TOKEN || request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
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
