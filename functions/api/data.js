export async function onRequestGet({ env, request }) {
  if (!isAuthed(request, env)) return new Response('Unauthorized', { status: 401 });
  // Global shared dataset for all users
  const key = 'global';
  const json = await env.KV.get(key);
  const data = json ? JSON.parse(json) : {
    currencyRate: 13,
    deliveryOptions: [],
    products: []
  };
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPut({ env, request }) {
  if (!isAuthed(request, env)) return new Response('Unauthorized', { status: 401 });
  if ((request.headers.get('content-type') || '').includes('application/json') === false) {
    return new Response('Expected application/json', { status: 415 });
  }
  const body = await request.json();
  const safe = {
    currencyRate: Number(body.currencyRate) || 0,
    deliveryOptions: Array.isArray(body.deliveryOptions) ? body.deliveryOptions : [],
    products: Array.isArray(body.products) ? body.products : []
  };
  const key = 'global';
  await env.KV.put(key, JSON.stringify(safe), { expirationTtl: 60 * 60 * 24 * 180 });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function isAuthed(request, env){
  if (!env.ACCESS_KEY) return true; // open if no key configured
  const cookie = request.headers.get('Cookie') || '';
  return /(?:^|; )SESSION=1(?:;|$)/.test(cookie);
}
