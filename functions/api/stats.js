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

export async function onRequestGet({ env, request }){
  if (!isAuthed(request, env)) return json({ error: 'Unauthorized' }, 401);

  // Read collections best-effort
  const [ordersRaw, shipmentsRaw, expensesRaw, salesRaw] = await Promise.all([
    env.KV.get('orders'),
    env.KV.get('shipments'),
    env.KV.get('expenses'),
    env.KV.get('sales')
  ]);
  const orders = ordersRaw ? (JSON.parse(ordersRaw).items || []) : [];
  const shipments = shipmentsRaw ? (JSON.parse(shipmentsRaw).items || []) : [];
  const expenses = expensesRaw ? (JSON.parse(expensesRaw).items || []) : [];
  const sales = salesRaw ? (JSON.parse(salesRaw).items || []) : [];

  // Aggregate orders by status
  const orderStatuses = ['draft','confirmed','paid','packed','shipped','delivered','cancelled'];
  const ordersByStatus = Object.fromEntries(orderStatuses.map(s => [s, 0]));
  for (const o of orders){ if (ordersByStatus[o.status] != null) ordersByStatus[o.status]++; }
  const ordersTotal = orders.length;

  // Shipments in transit
  const inTransitStatuses = new Set(['label','in_transit','customs']);
  const shipmentsInTransit = shipments.filter(s => inTransitStatuses.has(s.status)).length;

  // Finance sums (if present)
  const sum = (arr, f) => arr.reduce((a,b)=>a+Number(f(b)||0),0);
  const totalExpensesRUB = sum(expenses, e => e.currency==='RUB'?e.amountRUB:(Number(e.amountRUB)||0));
  const totalSalesRUB = sum(sales, s => s.amountRUB);
  const marginRUB = totalSalesRUB - totalExpensesRUB;

  return json({
    orders: { total: ordersTotal, byStatus: ordersByStatus },
    shipments: { inTransit: shipmentsInTransit, total: shipments.length },
    finance: { expensesRUB: totalExpensesRUB, salesRUB: totalSalesRUB, marginRUB }
  });
}
