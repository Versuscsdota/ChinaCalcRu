function isAuthed(request, env){
  if (!env.ACCESS_KEY) return true; // open if not configured
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|; )SESSION=1(?:;|$)/.test(cookie);
}

export async function onRequestGet({ env, request }){
  if (!isAuthed(request, env)) return new Response('Unauthorized', { status: 401 });
  const key = 'chat:global';
  const json = await env.KV.get(key);
  const list = json ? JSON.parse(json) : [];
  return new Response(JSON.stringify({ items: list }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestPut({ env, request }){
  if (!isAuthed(request, env)) return new Response('Unauthorized', { status: 401 });
  if ((request.headers.get('content-type') || '').includes('application/json') === false) {
    return new Response('Expected application/json', { status: 415 });
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const key = 'chat:global';
  await env.KV.put(key, JSON.stringify(items), { expirationTtl: 60 * 60 * 24 * 90 });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export async function onRequestDelete({ env, request }){
  if (!isAuthed(request, env)) return new Response('Unauthorized', { status: 401 });
  const key = 'chat:global';
  await env.KV.delete(key);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
