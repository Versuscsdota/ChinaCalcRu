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

function validateSale(s, idx){
  if (!s || typeof s !== 'object') return `item[${idx}] must be object`;
  if (!s.id) return `item[${idx}].id required`;
  if (!s.orderId) return `item[${idx}].orderId required`;
  const chans = new Set(['marketplace','direct','other']);
  if (s.channel && !chans.has(s.channel)) return `item[${idx}].channel invalid`;
  if (!Number.isFinite(Number(s.amountRUB))) return `item[${idx}].amountRUB invalid`;
  if (s.paidAt && Number.isNaN(Date.parse(s.paidAt))) return `item[${idx}].paidAt invalid`;
  return null;
}
function validatePayload(items){
  if (!Array.isArray(items)) return { ok:false, error:'items must be an array' };
  if (items.length > 5000) return { ok:false, error:'too many sales (max 5000)' };
  for (let i=0;i<items.length;i++){
    const err = validateSale(items[i], i);
    if (err) return { ok:false, error: err };
  }
  try{
    const size = new TextEncoder().encode(JSON.stringify({items})).length;
    if (size > 1024*1024) return { ok:false, error:'payload too large (>1MB)' };
  }catch{}
  return { ok:true };
}

export async function onRequestGet({ env, request }){
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);
  const raw = await env.KV.get('sales');
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
  await env.KV.put('sales', JSON.stringify({ items, updatedAt: Date.now(), version: 1 }), { expirationTtl: 60*60*24*180 });
  return json({ ok:true });
}
