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
function validateShipment(s, idx){
  const okStatus = new Set(['label','in_transit','customs','delivered','lost','returned']);
  if (!s || typeof s !== 'object') return `item[${idx}] must be object`;
  if (!s.id) return `item[${idx}].id required`;
  if (typeof s.carrier !== 'string' || !s.carrier.trim()) return `item[${idx}].carrier required`;
  if (typeof s.trackingNumber !== 'string' || !s.trackingNumber.trim()) return `item[${idx}].trackingNumber required`;
  if (!okStatus.has(s.status)) return `item[${idx}].status invalid`;
  if (s.costRUB != null && !Number.isFinite(Number(s.costRUB))) return `item[${idx}].costRUB invalid`;
  if (s.eta && Number.isNaN(Date.parse(s.eta))) return `item[${idx}].eta invalid date`;
  if (s.checkpoints && !Array.isArray(s.checkpoints)) return `item[${idx}].checkpoints must be array`;
  return null;
}
function validatePayload(items){
  if (!Array.isArray(items)) return { ok:false, error:'items must be an array' };
  if (items.length > 2000) return { ok:false, error:'too many shipments (max 2000)' };
  for (let i=0;i<items.length;i++){
    const err = validateShipment(items[i], i);
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
  const key = 'shipments';
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
  const key = 'shipments';
  await env.KV.put(key, JSON.stringify({ items, updatedAt: Date.now(), version: 1 }), { expirationTtl: 60*60*24*180 });
  return json({ ok:true });
}
