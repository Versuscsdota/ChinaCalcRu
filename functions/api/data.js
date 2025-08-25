export async function onRequestGet({ env, request }) {
  // Use a single global dataset. To make per-user data, use Cf-Access-Authenticated-User-Email header.
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
