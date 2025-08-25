function isAuthed(request, env){
  if (!env.ACCESS_KEY) return true;
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
function validateOrder(o, idx){
  const okStatus = new Set(['draft','confirmed','paid','packed','shipped','delivered','cancelled']);
  if (!o || typeof o !== 'object') return `item[${idx}] must be object`;
  if (!o.id) return `item[${idx}].id required`;
  if (!okStatus.has(o.status)) return `item[${idx}].status invalid`;
  if (!Array.isArray(o.items)) return `item[${idx}].items must be array`;
  for (let j=0;j<o.items.length;j++){
    const it = o.items[j];
    if (!it || typeof it !== 'object') return `item[${idx}].items[${j}] must be object`;
    if (!it.productId) return `item[${idx}].items[${j}].productId required`;
    if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) return `item[${idx}].items[${j}].qty invalid`;
  }
  return null;
}
function validatePayload(items){
  if (!Array.isArray(items)) return { ok:false, error:'items must be an array' };
  if (items.length > 1000) return { ok:false, error:'too many orders (max 1000)' };
  for (let i=0;i<items.length;i++){
    const err = validateOrder(items[i], i);
    if (err) return { ok:false, error: err };
  }
  try{
    const size = new TextEncoder().encode(JSON.stringify({items})).length;
    if (size > 512*1024) return { ok:false, error:'payload too large (>512KB)' };
  }catch{}
  return { ok:true };
}

export async function onRequestGet({ env, request }){
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  const key = 'orders';
  const raw = await env.KV.get(key);
  const list = raw ? JSON.parse(raw).items || [] : [];
  return json({ items: list });
}

export async function onRequestPut({ env, request }){
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  if ((request.headers.get('content-type') || '').includes('application/json') === false) {
    return json({ error: 'Expected application/json' }, 415);
  }
  const body = await request.json().catch(()=>({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const v = validatePayload(items);
  if (!v.ok) return json({ error: v.error }, 400);
  const key = 'orders';
  await env.KV.put(key, JSON.stringify({ items, updatedAt: Date.now(), version: 1 }), { expirationTtl: 60*60*24*180 });
  return json({ ok:true });
}
