function isAuthed(request, env){
  if (!env.ACCESS_KEY) return false;
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|; )SESSION=1(?:;|$)/.test(cookie);
}

function baseHeaders(){
  return {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=()'
  };
}

function json(obj, status = 200){
  return new Response(JSON.stringify(obj), { status, headers: baseHeaders() });
}

function validateItems(items){
  if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' };
  if (items.length > 200) return { ok: false, error: 'too many messages (max 200)' };
  const roles = new Set(['user','assistant']);
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    if (!m || typeof m !== 'object') return { ok: false, error: `item[${i}] must be object` };
    if (!roles.has(m.role)) return { ok: false, error: `item[${i}].role invalid` };
    if (typeof m.text !== 'string' || m.text.length > 4000) return { ok: false, error: `item[${i}].text invalid/too long` };
    if (m.ts != null && !Number.isFinite(Number(m.ts))) return { ok: false, error: `item[${i}].ts invalid` };
    if (m.image) {
      const im = m.image;
      if (typeof im !== 'object') return { ok: false, error: `item[${i}].image invalid` };
      if (im.dataUrl && typeof im.dataUrl !== 'string') return { ok: false, error: `item[${i}].image.dataUrl invalid` };
      if (im.name && typeof im.name !== 'string') return { ok: false, error: `item[${i}].image.name invalid` };
    }
  }
  // Approximate payload size limit (128KB)
  try {
    const size = new TextEncoder().encode(JSON.stringify({ items })).length;
    if (size > 128 * 1024) return { ok: false, error: 'payload too large (>128KB)' };
  } catch {}
  return { ok: true };
}

export async function onRequestGet({ env, request }){
  if (!env.ACCESS_KEY) return json({ error: 'Server not configured: set ACCESS_KEY' }, 500);
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  const key = 'chat:global';
  const raw = await env.KV.get(key);
  const list = raw ? JSON.parse(raw) : [];
  return json({ items: list });
}

export async function onRequestPut({ env, request }){
  if (!env.ACCESS_KEY) return json({ error: 'Server not configured: set ACCESS_KEY' }, 500);
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  if ((request.headers.get('content-type') || '').includes('application/json') === false) {
    return json({ error: 'Expected application/json' }, 415);
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const v = validateItems(items);
  if (!v.ok) return json({ error: v.error }, 400);
  const key = 'chat:global';
  await env.KV.put(key, JSON.stringify(items), { expirationTtl: 60 * 60 * 24 * 90 });
  return json({ ok: true });
}

export async function onRequestDelete({ env, request }){
  if (!env.ACCESS_KEY) return json({ error: 'Server not configured: set ACCESS_KEY' }, 500);
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  const key = 'chat:global';
  await env.KV.delete(key);
  return json({ ok: true });
}
