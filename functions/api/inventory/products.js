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

function validateProduct(p, idx){
  if (!p || typeof p !== 'object') return `item[${idx}] must be object`;
  if (!p.id) return `item[${idx}].id required`;
  if (typeof p.name !== 'string' || !p.name.trim()) return `item[${idx}].name required`;
  if (p.purchasePriceCNY != null && !Number.isFinite(Number(p.purchasePriceCNY))) return `item[${idx}].purchasePriceCNY invalid`;
  if (p.unitWeightKg != null && !Number.isFinite(Number(p.unitWeightKg))) return `item[${idx}].unitWeightKg invalid`;
  return null;
}
function validatePayload(items){
  if (!Array.isArray(items)) return { ok:false, error:'items must be an array' };
  if (items.length > 10000) return { ok:false, error:'too many products (max 10000)' };
  for (let i=0;i<items.length;i++){
    const err = validateProduct(items[i], i);
    if (err) return { ok:false, error: err };
  }
  try{
    const size = new TextEncoder().encode(JSON.stringify({items})).length;
    if (size > 2*1024*1024) return { ok:false, error:'payload too large (>2MB)' };
  }catch{}
  return { ok:true };
}

export async function onRequestGet({ env, request }){
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  const raw = await env.KV.get('inventory:products');
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
  await env.KV.put('inventory:products', JSON.stringify({ items, updatedAt: Date.now(), version: 1 }), { expirationTtl: 60*60*24*180 });
  return json({ ok:true });
}
