(function(){
  // App State
  const state = {
    currencyRate: 13.00,
    deliveryOptions: [], // { id, name, baseFeeRUB, pricePerKgRUB, minChargeRUB, minWeightKg, description }
    products: [], // { id, name, url, weightKg, quantity, unitPriceYuan, deliveryOptionName, finalPriceRUB }
    // Orders state
    orders: [], // { id, status, shipmentId?, items:[{productId, qty}], createdAt }
    selectedOrderId: null,
    // Shipments state
    shipments: [], // { id, carrier, trackingNumber, status, eta, costRUB }
    selectedShipmentId: null,
    // Inventory state
    inventoryProducts: [], // [{ id, name }] for datalist
    inventoryLedger: [], // { id, date, productId, type: in|out|reserve|release, qty, note }
    selectedLedgerId: null
  };

  // Cloud persistence (Pages Functions + KV)
  let saveTimer = null;
  function scheduleSave(){
    clearTimeout(saveTimer);
    setSaving('saving');
    saveTimer = setTimeout(saveToCloud, 500);
  }

  // Inventory API
  async function fetchInventoryProducts(){
    try{
      const res = await fetch('/api/inventory/products', { credentials: 'include' });
      if(!res.ok) return { items: [] };
      return await res.json();
    }catch{ return { items: [] }; }
  }
  async function fetchInventoryLedger(){
    try{
      const res = await fetch('/api/inventory/ledger', { credentials: 'include' });
      if(!res.ok) return { items: [] };
      return await res.json();
    }catch{ return { items: [] }; }
  }
  async function saveInventoryLedger(list){
    try{
      const res = await fetch('/api/inventory/ledger', { method: 'PUT', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ items: list }) });
      return res.ok;
    }catch{ return false; }
  }

  function populateInvProductDatalist(){
    if(!invEl.productList) return;
    invEl.productList.innerHTML = '';
    const seen = new Set();
    state.inventoryProducts.forEach(p => {
      const id = String(p.id||'').trim();
      if(!id || seen.has(id)) return;
      seen.add(id);
      const opt = document.createElement('option');
      opt.value = id; opt.label = p.name ? `${id} • ${p.name}` : id;
      invEl.productList.appendChild(opt);
    });
  }

  function computeStockFromLedger(ledger){
    const stock = new Map(); // id -> { productId, in, out, reserve, release }
    (Array.isArray(ledger)?ledger:[]).forEach(e => {
      const pid = String(e.productId||'').trim();
      const qty = Number(e.qty)||0;
      if(!pid || !Number.isInteger(qty) || qty<=0) return;
      if(!stock.has(pid)) stock.set(pid, { productId: pid, in:0, out:0, reserve:0, release:0 });
      const s = stock.get(pid);
      if(e.type==='in') s.in += qty;
      else if(e.type==='out') s.out += qty;
      else if(e.type==='reserve') s.reserve += qty;
      else if(e.type==='release') s.release += qty;
    });
    // map to rows
    return Array.from(stock.values()).map(s => ({
      productId: s.productId,
      available: Math.max(0, (s.in - s.out) - Math.max(0, s.reserve - s.release)),
      reserved: Math.max(0, s.reserve - s.release),
      totalIn: s.in,
      totalOut: s.out
    }));
  }

  function renderInventoryStock(){
    if(!invEl.stockBody) return;
    invEl.stockBody.innerHTML = '';
    const rows = computeStockFromLedger(state.inventoryLedger).sort((a,b)=>String(a.productId).localeCompare(String(b.productId)));
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.productId}</td>
        <td>${r.available}</td>
        <td>${r.reserved}</td>
        <td>${r.totalIn}</td>
        <td>${r.totalOut}</td>
      `;
      invEl.stockBody.appendChild(tr);
    });
    if(invEl.stockBody.children.length===0){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="5" class="muted">Нет данных</td>'; invEl.stockBody.appendChild(tr); }
  }

  function renderInventoryLedgerTable(){
    if(!invEl.ledgerBody) return;
    invEl.ledgerBody.innerHTML = '';
    const rows = state.inventoryLedger.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    rows.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${e.id}</td>
        <td>${e.date || ''}</td>
        <td>${e.productId}</td>
        <td>${e.type}</td>
        <td>${e.qty}</td>
        <td>${e.note||''}</td>
        <td class="actions">
          <button class="btn" data-act="edit">Ред.</button>
          <button class="btn danger" data-act="del">Удалить</button>
        </td>
      `;
      tr.querySelector('[data-act="edit"]').onclick = () => loadInventoryToForm(e.id);
      tr.querySelector('[data-act="del"]').onclick = async () => {
        if(!confirm('Удалить запись?')) return;
        state.inventoryLedger = state.inventoryLedger.filter(x => String(x.id)!==String(e.id));
        const ok = await saveInventoryLedger(state.inventoryLedger);
        if(!ok){ alert('Не удалось сохранить леджер'); return; }
        renderInventoryLedgerTable();
        renderInventoryStock();
      };
      invEl.ledgerBody.appendChild(tr);
    });
  }

  function clearInventoryForm(){
    state.selectedLedgerId = null;
    if(invEl.formTitle) invEl.formTitle.textContent = 'Создать / Редактировать запись';
    if(invEl.id) invEl.id.value = '';
    if(invEl.date) invEl.date.value = '';
    if(invEl.productId) invEl.productId.value = '';
    if(invEl.type) invEl.type.value = 'in';
    if(invEl.qty) invEl.qty.value = '';
    if(invEl.note) invEl.note.value = '';
    [invEl.id, invEl.date, invEl.productId, invEl.type, invEl.qty, invEl.note].forEach(clearInvalid);
  }

  function loadInventoryToForm(id){
    const e = state.inventoryLedger.find(x => String(x.id) === String(id));
    if(!e) return;
    state.selectedLedgerId = e.id;
    if(invEl.formTitle) invEl.formTitle.textContent = `Редактировать запись ${e.id}`;
    if(invEl.id) invEl.id.value = String(e.id||'');
    if(invEl.date) invEl.date.value = String(e.date||'');
    if(invEl.productId) invEl.productId.value = String(e.productId||'');
    if(invEl.type) invEl.type.value = String(e.type||'in');
    if(invEl.qty) invEl.qty.value = String(e.qty||'');
    if(invEl.note) invEl.note.value = String(e.note||'');
  }

  function isValidLedgerType(t){ return ['in','out','reserve','release'].includes(String(t)); }

  function collectInventoryFromForm(){
    const idRaw = (invEl.id?.value||'').trim();
    const dateStr = (invEl.date?.value||'').trim();
    const productId = (invEl.productId?.value||'').trim();
    const type = (invEl.type?.value||'in').trim();
    const qty = Number(invEl.qty?.value||0);
    const note = (invEl.note?.value||'').trim();

    let ok = true;
    if(!validateNonEmptyStr(productId)){ setInvalid(invEl.productId, 'Укажите товар'); ok=false; } else clearInvalid(invEl.productId);
    if(!isValidLedgerType(type)){ setInvalid(invEl.type, 'Недопустимый тип'); ok=false; } else clearInvalid(invEl.type);
    if(!validatePositiveInt(qty)){ setInvalid(invEl.qty, 'Количество должно быть целым > 0'); ok=false; } else clearInvalid(invEl.qty);
    if(!ok) return null;

    let date = undefined;
    if(dateStr){ const t = Date.parse(dateStr); if(Number.isFinite(t)) date = new Date(t).toISOString().slice(0,10); }
    if(!date){ // default to today
      const today = new Date(); date = today.toISOString().slice(0,10);
    }
    const id = idRaw || ('l' + Date.now());
    return { id, date, productId, type, qty: parseInt(String(qty),10), note: note || undefined };
  }

  async function refreshInventory(){
    const [prods, ledger] = await Promise.all([fetchInventoryProducts(), fetchInventoryLedger()]);
    state.inventoryProducts = Array.isArray(prods.items) ? prods.items : [];
    state.inventoryLedger = Array.isArray(ledger.items) ? ledger.items : [];
    populateInvProductDatalist();
    renderInventoryLedgerTable();
    renderInventoryStock();
    clearInventoryForm();
  }

  // ==========================
  // Shipments UI (CRUD + Validation)
  // ==========================
  function renderShipmentsCrudTable(){
    if(!shipEl.tableBody) return;
    shipEl.tableBody.innerHTML = '';
    const rows = state.shipments.slice().sort((a,b)=>String(b.id).localeCompare(String(a.id)));
    rows.forEach(s => {
      const tr = document.createElement('tr');
      const eta = s.eta ? new Date(s.eta) : null;
      tr.innerHTML = `
        <td>${s.id}</td>
        <td>${s.carrier||''}</td>
        <td>${s.trackingNumber||''}</td>
        <td>${s.status||''}</td>
        <td>${eta ? eta.toLocaleDateString() : ''}</td>
        <td>${Number(s.costRUB||0).toFixed(2)}</td>
        <td class="actions">
          <button class="btn" data-act="edit">Ред.</button>
          <button class="btn danger" data-act="del">Удалить</button>
        </td>
      `;
      tr.querySelector('[data-act="edit"]').onclick = () => loadShipmentToForm(s.id);
      tr.querySelector('[data-act="del"]').onclick = async () => {
        if(!confirm('Удалить отгрузку?')) return;
        state.shipments = state.shipments.filter(x => String(x.id) !== String(s.id));
        const ok = await saveShipments(state.shipments);
        if(!ok){ alert('Не удалось сохранить отгрузки'); return; }
        renderShipmentsCrudTable();
      };
      shipEl.tableBody.appendChild(tr);
    });
  }

  function clearShipmentForm(){
    state.selectedShipmentId = null;
    if(shipEl.formTitle) shipEl.formTitle.textContent = 'Создать / Редактировать отгрузку';
    if(shipEl.id) shipEl.id.value = '';
    if(shipEl.carrier) shipEl.carrier.value = '';
    if(shipEl.tracking) shipEl.tracking.value = '';
    if(shipEl.status) shipEl.status.value = 'label';
    if(shipEl.eta) shipEl.eta.value = '';
    if(shipEl.cost) shipEl.cost.value = '';
    [shipEl.id, shipEl.carrier, shipEl.tracking, shipEl.status, shipEl.eta, shipEl.cost].forEach(clearInvalid);
  }

  function loadShipmentToForm(id){
    const s = state.shipments.find(x => String(x.id) === String(id));
    if(!s) return;
    state.selectedShipmentId = s.id;
    if(shipEl.formTitle) shipEl.formTitle.textContent = `Редактировать отгрузку ${s.id}`;
    if(shipEl.id) shipEl.id.value = String(s.id||'');
    if(shipEl.carrier) shipEl.carrier.value = String(s.carrier||'');
    if(shipEl.tracking) shipEl.tracking.value = String(s.trackingNumber||'');
    if(shipEl.status) shipEl.status.value = String(s.status||'label');
    if(shipEl.eta) shipEl.eta.value = s.eta ? new Date(s.eta).toISOString().slice(0,10) : '';
    if(shipEl.cost) shipEl.cost.value = Number(s.costRUB||0).toFixed(2);
  }

  function isValidShipmentStatus(v){
    return ['label','in_transit','customs','delivered','lost','returned'].includes(v);
  }

  function collectShipmentFromForm(){
    const idRaw = (shipEl.id?.value||'').trim();
    const carrier = (shipEl.carrier?.value||'').trim();
    const trackingNumber = (shipEl.tracking?.value||'').trim();
    const status = (shipEl.status?.value||'').trim();
    const etaStr = (shipEl.eta?.value||'').trim();
    const costRUB = Number(shipEl.cost?.value||0);

    let ok = true;
    if(!validateNonEmptyStr(carrier)){ setInvalid(shipEl.carrier, 'Укажите курьера'); ok = false; } else clearInvalid(shipEl.carrier);
    if(!isValidShipmentStatus(status)){ setInvalid(shipEl.status, 'Недопустимый статус'); ok = false; } else clearInvalid(shipEl.status);
    if(!(validateNonNegativeNum(costRUB))){ setInvalid(shipEl.cost, 'Цена не может быть отрицательной'); ok = false; } else clearInvalid(shipEl.cost);
    if(!ok) return null;

    let eta = undefined;
    if(etaStr){
      const t = Date.parse(etaStr);
      if(Number.isFinite(t)) eta = new Date(t).toISOString().slice(0,10);
    }

    const existing = state.shipments.find(x => String(x.id) === String(state.selectedShipmentId || idRaw));
    const id = idRaw || ('s' + Date.now());
    return { id, carrier, trackingNumber: trackingNumber || undefined, status, eta, costRUB: Number(costRUB.toFixed(2)) };
  }

  async function refreshShipments(){
    const data = await fetchShipments();
    state.shipments = Array.isArray(data.items) ? data.items : [];
    renderShipmentsCrudTable();
    clearShipmentForm();
  }

  async function loadFromCloud(){
    try{
      const res = await fetch('/api/data', { credentials: 'include' });
      if(!res.ok) return;
      const data = await res.json();
      state.currencyRate = Number(data.currencyRate) || state.currencyRate;
      state.deliveryOptions = Array.isArray(data.deliveryOptions) ? data.deliveryOptions : [];
      state.products = Array.isArray(data.products) ? data.products : [];
      el.currencyRate.value = state.currencyRate.toFixed(2);
      renderDeliveryList();
      renderProducts();
      recalcAll();
      setSaving('saved');
      // Update dashboard after initial data loaded
      updateDashboard();
    }catch(e){ console.warn('loadFromCloud failed', e); }
  }

  async function saveToCloud(){
    try{
      const payload = {
        currencyRate: Number(state.currencyRate),
        deliveryOptions: state.deliveryOptions,
        products: state.products
      };
      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if(!res.ok) { setSaving('error'); return; }
      setSaving('saved');
    }catch(e){ console.warn('saveToCloud failed', e); }
  }

  // Elements
  const el = {
    authCard: document.getElementById('authCard'),
    app: document.getElementById('app'),
    accessKeyInput: document.getElementById('accessKeyInput'),
    authError: document.getElementById('authError'),
    btnLogin: document.getElementById('btnLogin'),

    currencyRate: document.getElementById('currencyRate'),
    btnUpdateRate: document.getElementById('btnUpdateRate'),

    // Delivery modal controls
    btnOpenDeliveryModal: document.getElementById('btnOpenDeliveryModal'),
    deliveryList: document.getElementById('deliveryList'),
    deliveryModal: document.getElementById('deliveryModal'),
    dmName: document.getElementById('dmName'),
    dmBase: document.getElementById('dmBase'),
    dmPerKg: document.getElementById('dmPerKg'),
    dmMinCh: document.getElementById('dmMinCh'),
    dmMinW: document.getElementById('dmMinW'),
    dmDesc: document.getElementById('dmDesc'),
    btnDeliveryCancel: document.getElementById('btnDeliveryCancel'),
    btnDeliverySave: document.getElementById('btnDeliverySave'),

    btnAddProduct: document.getElementById('btnAddProduct'),
    productsBody: document.getElementById('productsBody'),

    btnExportXlsx: document.getElementById('btnExportXlsx'),
    btnClearAll: document.getElementById('btnClearAll'),

    grandTotal: document.getElementById('grandTotal'),
    saveStatus: document.getElementById('saveStatus'),

    // Dashboard KPIs & Shipments
    kpiOrders: document.getElementById('kpiOrders'),
    kpiInTransit: document.getElementById('kpiInTransit'),
    kpiSales: document.getElementById('kpiSales'),
    kpiExpenses: document.getElementById('kpiExpenses'),
    kpiMargin: document.getElementById('kpiMargin'),
    shipmentsBody: document.getElementById('shipmentsBody'),
    ordersStatusBody: document.getElementById('ordersStatusBody'),
    alertsList: document.getElementById('alertsList'),

    // AI Chat
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSend: document.getElementById('chatSend'),
    chatFile: document.getElementById('chatFile'),
    chatClear: document.getElementById('chatClear'),

    // Tabs
    tabBtnDashboard: document.getElementById('tabBtnDashboard'),
    tabBtnOrders: document.getElementById('tabBtnOrders'),
    tabBtnShipments: document.getElementById('tabBtnShipments'),
    tabBtnInventory: document.getElementById('tabBtnInventory'),
    tabBtnDeliveries: document.getElementById('tabBtnDeliveries'),
    tabBtnProducts: document.getElementById('tabBtnProducts'),
    tabBtnAI: document.getElementById('tabBtnAI'),
    panelDashboard: document.getElementById('panelDashboard'),
    panelOrders: document.getElementById('panelOrders'),
    panelShipments: document.getElementById('panelShipments'),
    panelInventory: document.getElementById('panelInventory'),
    panelDeliveries: document.getElementById('panelDeliveries'),
    panelProducts: document.getElementById('panelProducts'),
    panelAI: document.getElementById('panelAI'),
  };

  // Orders DOM refs
  const orderEl = {
    btnNew: document.getElementById('btnOrderNew'),
    btnRefresh: document.getElementById('btnOrdersRefresh'),
    tableBody: document.getElementById('ordersTableBody'),
    formTitle: document.getElementById('orderFormTitle'),
    id: document.getElementById('orderId'),
    status: document.getElementById('orderStatus'),
    shipmentId: document.getElementById('orderShipmentId'),
    items: document.getElementById('orderItems'),
    btnSave: document.getElementById('btnOrderSave'),
    btnCancel: document.getElementById('btnOrderCancel'),
  };

  // Shipments DOM refs
  const shipEl = {
    btnNew: document.getElementById('btnShipNew'),
    btnRefresh: document.getElementById('btnShipRefresh'),
    tableBody: document.getElementById('shipmentsCrudBody'),
    formTitle: document.getElementById('shipFormTitle'),
    id: document.getElementById('shipId'),
    carrier: document.getElementById('shipCarrier'),
    tracking: document.getElementById('shipTracking'),
    status: document.getElementById('shipStatus'),
    eta: document.getElementById('shipEta'),
    cost: document.getElementById('shipCost'),
    btnSave: document.getElementById('btnShipSave'),
    btnCancel: document.getElementById('btnShipCancel'),
  };

  // Inventory DOM refs
  const invEl = {
    panel: document.getElementById('panelInventory'),
    stockBody: document.getElementById('invStockBody'),
    ledgerBody: document.getElementById('invLedgerBody'),
    formTitle: document.getElementById('invFormTitle'),
    id: document.getElementById('invLedId'),
    date: document.getElementById('invLedDate'),
    productId: document.getElementById('invLedProductId'),
    type: document.getElementById('invLedType'),
    qty: document.getElementById('invLedQty'),
    note: document.getElementById('invLedNote'),
    productList: document.getElementById('invProductList'),
    btnNew: document.getElementById('btnInvNew'),
    btnRefresh: document.getElementById('btnInvRefresh'),
    btnSave: document.getElementById('btnInvSave'),
    btnCancel: document.getElementById('btnInvCancel'),
  };

  // Save status helper (moved here so it can access `el.saveStatus`)
  function setSaving(status){
    if(!el.saveStatus) return;
    if(status === 'saving'){
      el.saveStatus.textContent = 'Сохранение…';
      el.saveStatus.style.background = '#fff3cd';
      el.saveStatus.style.color = '#92400e';
    } else if(status === 'saved'){
      el.saveStatus.textContent = 'Сохранено';
      el.saveStatus.style.background = '#dcfce7';
      el.saveStatus.style.color = '#166534';
    } else if(status === 'error'){
      el.saveStatus.textContent = 'Ошибка сохранения';
      el.saveStatus.style.background = '#fee2e2';
      el.saveStatus.style.color = '#991b1b';
    }
  }

  // ==========================
  // Orders UI (CRUD + Validation)
  // ==========================
  async function fetchOrders(){
    try{
      const res = await fetch('/api/orders', { credentials: 'include' });
      if(!res.ok) return { items: [] };
      return await res.json();
    }catch{ return { items: [] }; }
  }
  async function saveOrders(list){
    try{
      const res = await fetch('/api/orders', { method:'PUT', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify({ items: list }) });
      return res.ok;
    }catch{ return false; }
  }
  // Fill datalist for order's shipmentId
  async function populateShipmentDatalist(){
    const dl = document.getElementById('shipmentIdList');
    if(!dl) return;
    let list = state.shipments;
    if(!Array.isArray(list) || list.length === 0){
      const data = await fetchShipments();
      list = Array.isArray(data.items) ? data.items : [];
    }
    dl.innerHTML = '';
    list.forEach(s => {
      const opt = document.createElement('option');
      const id = String(s.id || s.trackingNumber || '');
      opt.value = id;
      opt.label = `${id} • ${s.carrier||''} ${s.trackingNumber||''}`.trim();
      dl.appendChild(opt);
    });
  }

  function renderOrdersTable(){
    if(!orderEl.tableBody) return;
    orderEl.tableBody.innerHTML = '';
    const rows = state.orders.slice().sort((a,b)=>String(b.createdAt||'')-String(a.createdAt||''));
    rows.forEach(o => {
      const tr = document.createElement('tr');
      const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
      const created = o.createdAt ? new Date(o.createdAt) : null;
      tr.innerHTML = `
        <td>${o.id}</td>
        <td>${o.status}</td>
        <td>${o.shipmentId||''}</td>
        <td>${itemsCount}</td>
        <td>${created ? created.toLocaleString() : ''}</td>
        <td class="actions">
          <button class="btn" data-act="edit">Ред.</button>
          <button class="btn danger" data-act="del">Удалить</button>
        </td>
      `;
      const btnE = tr.querySelector('[data-act="edit"]');
      const btnD = tr.querySelector('[data-act="del"]');
      btnE.onclick = () => loadOrderToForm(o.id);
      btnD.onclick = async () => {
        if(!confirm('Удалить заказ?')) return;
        state.orders = state.orders.filter(x => String(x.id) !== String(o.id));
        await saveOrders(state.orders);
        renderOrdersTable();
      };
      orderEl.tableBody.appendChild(tr);
    });
  }

  function clearOrderForm(){
    state.selectedOrderId = null;
    if(orderEl.formTitle) orderEl.formTitle.textContent = 'Создать / Редактировать заказ';
    if(orderEl.id) orderEl.id.value = '';
    if(orderEl.status) orderEl.status.value = 'draft';
    if(orderEl.shipmentId) orderEl.shipmentId.value = '';
    if(orderEl.items) orderEl.items.value = '';
    [orderEl.id, orderEl.status, orderEl.shipmentId, orderEl.items].forEach(clearInvalid);
  }

  function loadOrderToForm(id){
    const o = state.orders.find(x => String(x.id) === String(id));
    if(!o) return;
    state.selectedOrderId = o.id;
    if(orderEl.formTitle) orderEl.formTitle.textContent = `Редактировать заказ ${o.id}`;
    if(orderEl.id) orderEl.id.value = String(o.id||'');
    if(orderEl.status) orderEl.status.value = String(o.status||'draft');
    if(orderEl.shipmentId) orderEl.shipmentId.value = String(o.shipmentId||'');
    if(orderEl.items) orderEl.items.value = JSON.stringify(Array.isArray(o.items)?o.items:[], null, 2);
  }

  function parseItems(jsonText){
    try{
      const arr = JSON.parse(jsonText || '[]');
      if(!Array.isArray(arr)) return null;
      const out = [];
      for(const it of arr){
        if(!it || typeof it !== 'object') return null;
        const productId = String(it.productId||'').trim();
        const qty = Number(it.qty);
        if(!productId || !Number.isInteger(qty) || qty <= 0) return null;
        out.push({ productId, qty });
        if(out.length > 200) break; // ограничение размера
      }
      return out;
    }catch{ return null; }
  }

  function isValidStatusTransition(prev, next){
    if(!prev) return true; // новое -> любое допустимо
    if(prev === next) return true;
    const order = ['draft','confirmed','paid','packed','shipped','delivered'];
    const idxPrev = order.indexOf(prev);
    const idxNext = order.indexOf(next);
    if(next === 'cancelled') return true; // можно отменить из любого
    if(idxPrev === -1 || idxNext === -1) return false;
    // Разрешаем только движение вперед на одну или несколько ступеней (без возврата)
    return idxNext >= idxPrev;
  }

  async function collectOrderFromForm(){
    const idRaw = (orderEl.id?.value||'').trim();
    const status = (orderEl.status?.value||'draft').trim();
    const shipmentId = (orderEl.shipmentId?.value||'').trim();
    const itemsText = (orderEl.items?.value||'').trim();

    // ID: допускаем пустой (будет сгенерирован)
    if(orderEl.id) clearInvalid(orderEl.id);
    if(orderEl.status) clearInvalid(orderEl.status);

    // items
    const items = parseItems(itemsText);
    if(!items){ setInvalid(orderEl.items, 'Нужно указать массив {productId, qty>0}'); return null; }
    clearInvalid(orderEl.items);

    // контролируем переход статуса
    const existing = state.orders.find(x => String(x.id) === String(state.selectedOrderId||idRaw));
    const prevStatus = existing?.status;
    if(!isValidStatusTransition(prevStatus, status)){
      setInvalid(orderEl.status, `Недопустимый переход: ${prevStatus||'new'} -> ${status}`);
      return null;
    }

    // требуем shipmentId для статусов shipped/delivered
    if(['shipped','delivered'].includes(status) && !shipmentId){
      setInvalid(orderEl.shipmentId, 'Для статусов shipped/delivered требуется указать отгрузку');
      return null;
    }

    // необязательная проверка shipmentId (если указан — должен существовать)
    if(shipmentId){
      const sh = await fetchShipments();
      const exists = Array.isArray(sh.items) && sh.items.some(s => String(s.id||s.trackingNumber) === shipmentId || String(s.id) === shipmentId);
      if(!exists){
        const proceed = confirm('Указанный ID отгрузки не найден. Продолжить сохранение?');
        if(!proceed) { setInvalid(orderEl.shipmentId, 'Не найдена отгрузка'); return null; }
      }
      clearInvalid(orderEl.shipmentId);
    }

    const id = idRaw || ('o' + Date.now());
    return {
      id,
      status,
      shipmentId: shipmentId || undefined,
      items,
      createdAt: existing?.createdAt || new Date().toISOString()
    };
  }

  async function refreshOrders(){
    const data = await fetchOrders();
    state.orders = Array.isArray(data.items) ? data.items : [];
    renderOrdersTable();
    clearOrderForm();
    // обновим список отгрузок для выбора в форме
    populateShipmentDatalist();
  }

  // Helpers
  function showAuthError(msg) {
    if(!el.authError) return;
    el.authError.textContent = msg || 'Ошибка входа';
    el.authError.classList.remove('hidden');
  }
  function hideAuthError() { if(el.authError) el.authError.classList.add('hidden'); }

  function fmt2(n){ return (Number(n)||0).toFixed(2); }
  function isValidUrl(u){ try { new URL(u); return true; } catch { return false; } }

  function validateNonEmptyStr(v){ return typeof v === 'string' && v.trim().length > 0; }
  function validatePositiveInt(v){ const n = Number(v); return Number.isInteger(n) && n > 0; }
  function validatePositiveNum(v){ const n = Number(v); return Number.isFinite(n) && n > 0; }
  function validateNonNegativeNum(v){ const n = Number(v); return Number.isFinite(n) && n >= 0; }

  // UI validation helpers
  function setInvalid(input, msg){
    if(!input) return;
    input.classList.add('invalid');
    if(msg) input.title = msg; else input.removeAttribute('title');
  }
  function clearInvalid(input){
    if(!input) return;
    input.classList.remove('invalid');
    input.removeAttribute('title');
  }

  function recalcProduct(p){
    const goodsRUB = Number(p.unitPriceYuan) * Number(p.quantity) * Number(state.currencyRate);
    const delivery = state.deliveryOptions.find(d => d.name === p.deliveryOptionName);
    let deliveryCost = 0;
    if(delivery){
      const base = Number(delivery.baseFeeRUB) || 0;
      const perKg = Number(delivery.pricePerKgRUB) || 0;
      const minCh = Number(delivery.minChargeRUB) || 0;
      const minW  = Number(delivery.minWeightKg) || 0;
      const totalWeight = Math.max((Number(p.weightKg)||0) * (Number(p.quantity)||0), minW);
      deliveryCost = base + Math.max(perKg * totalWeight, minCh);
    }
    p.finalPriceRUB = goodsRUB + deliveryCost;
    p._deliveryCostRUB = deliveryCost; // cache for export
    p._goodsRUB = goodsRUB;
    return p.finalPriceRUB;
  }

  function recalcAll(){
    let sum = 0;
    state.products.forEach(p => sum += recalcProduct(p));
    el.grandTotal.textContent = fmt2(sum);
  }

  // Dashboard data: KPIs and shipments-in-transit
  async function fetchStats(){
    try{
      const res = await fetch('/api/stats', { credentials: 'include' });
      if(!res.ok) return null;
      return await res.json();
    }catch{ return null; }
  }
  async function fetchShipments(){
    try{
      const res = await fetch('/api/shipments', { credentials: 'include' });
      if(!res.ok) return { items: [] };
      return await res.json();
    }catch{ return { items: [] }; }
  }
  async function saveShipments(list){
    try{
      const res = await fetch('/api/shipments', { method:'PUT', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify({ items: list }) });
      return res.ok;
    }catch{ return false; }
  }
  function renderKPIs(stats){
    if(!stats) return;
    if(el.kpiOrders) el.kpiOrders.textContent = String(stats.orders?.total ?? 0);
    if(el.kpiInTransit) el.kpiInTransit.textContent = String(stats.shipments?.inTransit ?? 0);
    if(el.kpiSales) el.kpiSales.textContent = fmt2(stats.finance?.salesRUB ?? 0);
    if(el.kpiExpenses) el.kpiExpenses.textContent = fmt2(stats.finance?.expensesRUB ?? 0);
    if(el.kpiMargin) el.kpiMargin.textContent = fmt2(stats.finance?.marginRUB ?? 0);
    // Orders status breakdown
    if(el.ordersStatusBody){
      el.ordersStatusBody.innerHTML = '';
      const orderStatuses = ['draft','confirmed','paid','packed','shipped','delivered','cancelled'];
      const map = stats.orders?.byStatus || {};
      orderStatuses.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s}</td><td>${Number(map[s]||0)}</td>`;
        el.ordersStatusBody.appendChild(tr);
      });
    }
  }
  function renderShipmentsTable(list){
    if(!el.shipmentsBody) return;
    el.shipmentsBody.innerHTML = '';
    const inTransit = new Set(['label','in_transit','customs']);
    list.filter(s => inTransit.has(s.status)).forEach(s => {
      const tr = document.createElement('tr');
      const eta = s.eta ? new Date(s.eta) : null;
      tr.innerHTML = `
        <td>${(s.carrier||'').toString()}</td>
        <td>${(s.trackingNumber||'').toString()}</td>
        <td>${(s.status||'').toString()}</td>
        <td>${eta ? eta.toLocaleDateString() : ''}</td>
      `;
      el.shipmentsBody.appendChild(tr);
    });
    if(el.shipmentsBody.children.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="muted">Нет отгрузок в пути</td>';
      el.shipmentsBody.appendChild(tr);
    }
  }
  async function updateDashboard(){
    const [stats, shipments] = await Promise.all([fetchStats(), fetchShipments()]);
    if(stats) renderKPIs(stats);
    renderShipmentsTable(Array.isArray(shipments?.items) ? shipments.items : []);
    // Alerts list
    if(el.alertsList){
      el.alertsList.innerHTML = '';
      const alerts = [];
      const now = Date.now();
      const list = Array.isArray(shipments?.items) ? shipments.items : [];
      list.forEach(s => {
        const etaMs = s.eta ? Date.parse(s.eta) : NaN;
        if(s.status === 'lost' || s.status === 'returned'){
          alerts.push(`Отгрузка ${s.trackingNumber||s.id}: статус ${s.status}`);
        } else if(Number.isFinite(etaMs) && etaMs < now && s.status !== 'delivered'){
          alerts.push(`Отгрузка ${s.trackingNumber||s.id}: просрочен ETA`);
        }
      });
      if(alerts.length === 0){
        const li = document.createElement('li'); li.className='muted'; li.textContent='Нет алертов'; el.alertsList.appendChild(li);
      } else {
        alerts.forEach(t => { const li = document.createElement('li'); li.textContent = t; el.alertsList.appendChild(li); });
      }
    }
  }

  function renderDeliveryList(){
    el.deliveryList.innerHTML = '';
    if(state.deliveryOptions.length === 0){
      const empty = document.createElement('div');
      empty.textContent = 'Нет вариантов доставки';
      el.deliveryList.appendChild(empty);
      return;
    }
    state.deliveryOptions.forEach(d => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.margin = '0';
      card.style.padding = '12px';
      // Inline edit UI
      card.innerHTML = `
        <div class="stack" style="gap:8px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
              <label>Название</label>
              <input type="text" data-f="name" value="${d.name}" />
            </div>
            <div>
              <label>Описание</label>
              <input type="text" data-f="desc" value="${d.description||''}" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;">
            <div>
              <label>Базовая плата (RUB)</label>
              <input type="number" step="0.01" min="0" data-f="base" value="${Number(d.baseFeeRUB||0).toFixed(2)}" />
            </div>
            <div>
              <label>Цена за кг (RUB/кг)</label>
              <input type="number" step="0.01" min="0" data-f="perKg" value="${Number(d.pricePerKgRUB||0).toFixed(2)}" />
            </div>
            <div>
              <label>Мин. списание (RUB)</label>
              <input type="number" step="0.01" min="0" data-f="minCh" value="${Number(d.minChargeRUB||0).toFixed(2)}" />
            </div>
            <div>
              <label>Мин. вес (кг)</label>
              <input type="number" step="0.01" min="0" data-f="minW" value="${Number(d.minWeightKg||0).toFixed(2)}" />
            </div>
          </div>
          <div class="actions">
            <button class="btn ok" data-act="save">Сохранить</button>
            <button class="btn danger" data-act="del">Удалить</button>
          </div>
        </div>
      `;

      card.querySelector('[data-act="save"]').onclick = () => {
        const name = (card.querySelector('[data-f="name"]').value||'').trim();
        const desc = (card.querySelector('[data-f="desc"]').value||'').trim();
        const base = Number(card.querySelector('[data-f="base"]').value);
        const perKg = Number(card.querySelector('[data-f="perKg"]').value);
        const minCh = Number(card.querySelector('[data-f="minCh"]').value||0);
        const minW  = Number(card.querySelector('[data-f="minW"]').value||0);
        if(!validateNonEmptyStr(name)) return alert('Название не может быть пустым');
        if(base < 0 || perKg < 0 || minCh < 0 || minW < 0) return alert('Числа не могут быть отрицательными');
        d.name = name;
        d.baseFeeRUB = Number(base.toFixed(2));
        d.pricePerKgRUB = Number(perKg.toFixed(2));
        d.minChargeRUB = Number(minCh.toFixed(2));
        d.minWeightKg = Number(minW.toFixed(2));
        d.description = desc;
        renderDeliveryList();
        renderProducts();
        recalcAll();
        scheduleSave();
      };

      card.querySelector('[data-act="del"]').onclick = () => {
        if(!confirm('Удалить вариант доставки?')) return;
        state.deliveryOptions = state.deliveryOptions.filter(x => x !== d);
        // удалить у товаров ссылку на удаленный вариант
        state.products.forEach(p => { if(p.deliveryOptionName === d.name) p.deliveryOptionName = ''; });
        renderDeliveryList();
        renderProducts();
        recalcAll();
        scheduleSave();
      };
      el.deliveryList.appendChild(card);
    });
  }

  function renderProducts(){
    el.productsBody.innerHTML = '';
    state.products.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td><input type="text" value="${p.name}"/></td>
        <td class="link-cell">
          <input type="url" placeholder="https://..." value="${p.url || ''}"/>
          ${p.url && isValidUrl(p.url) ? `<a href="${p.url}" target="_blank" title="Открыть ссылку">🔗</a>` : ''}
        </td>
        <td><input type="number" min="0" step="0.01" value="${p.weightKg ?? 0}"/></td>
        <td><input type="number" min="1" step="1" value="${p.quantity}"/></td>
        <td><input type="number" min="0" step="0.01" value="${p.unitPriceYuan}"/></td>
        <td>
          <select>
            <option value="">— Выбрать —</option>
            ${state.deliveryOptions.map(d => `<option value="${d.name}" ${d.name===p.deliveryOptionName?'selected':''}>${d.name}</option>`).join('')}
          </select>
        </td>
        <td class="right final">${fmt2(p.finalPriceRUB)}</td>
        <td class="actions">
          <button class="btn danger">Удалить</button>
        </td>
      `;
      const nameI = tr.children[1].querySelector('input');
      const urlI  = tr.children[2].querySelector('input');
      const weightI = tr.children[3].querySelector('input');
      const qtyI  = tr.children[4].querySelector('input');
      const priceI= tr.children[5].querySelector('input');
      const select= tr.children[6].querySelector('select');
      const delBtn= tr.children[8].querySelector('button');

      // Name: required non-empty
      nameI.oninput = () => {
        p.name = nameI.value;
        if(!validateNonEmptyStr(p.name)) setInvalid(nameI, 'Название не может быть пустым');
        else clearInvalid(nameI);
        scheduleSave();
      };
      urlI.oninput = () => {
        p.url = urlI.value.trim();
        // manage icon
        const cell = urlI.parentElement;
        let a = cell.querySelector('a');
        if(p.url && isValidUrl(p.url)){
          if(!a){ a = document.createElement('a'); a.textContent='🔗'; a.target='_blank'; a.title='Открыть ссылку'; cell.appendChild(a); }
          a.href = p.url;
          a.classList.remove('hidden');
          clearInvalid(urlI);
        } else {
          if(a){ a.classList.add('hidden'); }
          if(p.url.length>0) setInvalid(urlI, 'Некорректный URL'); else clearInvalid(urlI);
        }
        scheduleSave();
      };
      // Weight: non-negative number
      weightI.oninput = () => {
        const v = Number(weightI.value);
        if(v < 0 || !Number.isFinite(v)) { setInvalid(weightI, 'Вес не может быть отрицательным'); return; }
        clearInvalid(weightI);
        p.weightKg = v;
        tr.querySelector('.final').textContent = fmt2(recalcProduct(p));
        recalcAll();
        scheduleSave();
      };
      weightI.onblur = () => {
        let v = Number(weightI.value);
        if(!Number.isFinite(v) || v < 0) v = 0;
        weightI.value = Number(v).toFixed(2);
      };
      
      // Quantity: positive integer
      qtyI.oninput = () => {
        if(!validatePositiveInt(qtyI.value)) { setInvalid(qtyI, 'Количество должно быть целым > 0'); return; }
        clearInvalid(qtyI);
        p.quantity = Number(qtyI.value);
        tr.querySelector('.final').textContent = fmt2(recalcProduct(p));
        recalcAll();
        scheduleSave();
      };
      qtyI.onblur = () => {
        let n = parseInt(qtyI.value, 10);
        if(!Number.isInteger(n) || n <= 0) n = 1;
        qtyI.value = String(n);
      };

      // Unit price (CNY): non-negative number
      priceI.oninput = () => {
        if(!validateNonNegativeNum(priceI.value)) { setInvalid(priceI, 'Цена не может быть отрицательной'); return; }
        clearInvalid(priceI);
        p.unitPriceYuan = Number(priceI.value);
        tr.querySelector('.final').textContent = fmt2(recalcProduct(p));
        recalcAll();
        scheduleSave();
      };
      priceI.onblur = () => {
        let v = Number(priceI.value);
        if(!Number.isFinite(v) || v < 0) v = 0;
        priceI.value = Number(v).toFixed(2);
      };
      select.onchange = () => { p.deliveryOptionName = select.value; tr.querySelector('.final').textContent = fmt2(recalcProduct(p)); recalcAll(); scheduleSave(); };
      delBtn.onclick = () => { if(!confirm('Удалить товар?')) return; state.products = state.products.filter(x => x !== p); renderProducts(); recalcAll(); scheduleSave(); };

      el.productsBody.appendChild(tr);
    });
  }

  function addProduct(){
    const p = { id: Date.now(), name: '', url: '', weightKg: 0, quantity: 1, unitPriceYuan: 0.00, deliveryOptionName: '', finalPriceRUB: 0 };
    recalcProduct(p);
    state.products.push(p);
    renderProducts();
    recalcAll();
  }

  // Event wiring (auth removed)

  // Tabs switching
  function setTab(name){
    const btns = [el.tabBtnDashboard, el.tabBtnOrders, el.tabBtnShipments, el.tabBtnInventory, el.tabBtnDeliveries, el.tabBtnProducts, el.tabBtnAI];
    const panels = [el.panelDashboard, el.panelOrders, el.panelShipments, el.panelInventory, el.panelDeliveries, el.panelProducts, el.panelAI];
    const names = ['dashboard','orders','shipments','inventory','deliveries','products','ai'];
    names.forEach((n, i) => {
      if(!btns[i] || !panels[i]) return;
      if(n === name){
        btns[i].classList.add('active');
        panels[i].classList.remove('hidden');
        if(n === 'ai'){
          // ensure chat history visible when opening AI tab
          renderChatHistory();
        }
        if(n === 'dashboard'){
          updateDashboard();
        }
        if(n === 'orders'){
          refreshOrders();
        }
        if(n === 'shipments'){
          refreshShipments();
        }
        if(n === 'inventory'){
          refreshInventory();
        }
      } else {
        btns[i].classList.remove('active');
        panels[i].classList.add('hidden');
      }
    });
  }
  if(el.tabBtnDashboard) el.tabBtnDashboard.onclick = () => setTab('dashboard');
  if(el.tabBtnOrders) el.tabBtnOrders.onclick = () => setTab('orders');
  if(el.tabBtnShipments) el.tabBtnShipments.onclick = () => setTab('shipments');
  if(el.tabBtnInventory) el.tabBtnInventory.onclick = () => setTab('inventory');
  if(el.tabBtnDeliveries) el.tabBtnDeliveries.onclick = () => setTab('deliveries');
  if(el.tabBtnProducts) el.tabBtnProducts.onclick = () => setTab('products');
  if(el.tabBtnAI) el.tabBtnAI.onclick = () => setTab('ai');

  // Orders: events
  if(orderEl.btnRefresh){ orderEl.btnRefresh.onclick = () => refreshOrders(); }
  if(orderEl.btnNew){ orderEl.btnNew.onclick = () => clearOrderForm(); }
  if(orderEl.btnCancel){ orderEl.btnCancel.onclick = () => clearOrderForm(); }
  if(orderEl.btnSave){
    orderEl.btnSave.onclick = async () => {
      const obj = await collectOrderFromForm();
      if(!obj) return;
      // prevent duplicate IDs
      const existingIdx = state.orders.findIndex(x => String(x.id) === String(state.selectedOrderId ?? obj.id));
      const duplicateIdIdx = state.orders.findIndex(x => String(x.id) === String(obj.id));
      if(existingIdx !== -1 && duplicateIdIdx !== -1 && duplicateIdIdx !== existingIdx){
        alert('ID заказа уже существует');
        setInvalid(orderEl.id, 'Дубликат ID');
        return;
      }
      clearInvalid(orderEl.id);
      if(existingIdx === -1){
        state.orders.push(obj);
      } else {
        state.orders[existingIdx] = obj;
      }
      const ok = await saveOrders(state.orders);
      if(!ok){ alert('Не удалось сохранить заказы'); return; }
      renderOrdersTable();
      clearOrderForm();
    };
  }

  // Shipments: events
  if(shipEl.btnRefresh){ shipEl.btnRefresh.onclick = () => refreshShipments(); }
  if(shipEl.btnNew){ shipEl.btnNew.onclick = () => clearShipmentForm(); }
  if(shipEl.btnCancel){ shipEl.btnCancel.onclick = () => clearShipmentForm(); }
  if(shipEl.btnSave){
    shipEl.btnSave.onclick = async () => {
      const obj = collectShipmentFromForm();
      if(!obj) return;
      const existingIdx = state.shipments.findIndex(x => String(x.id) === String(state.selectedShipmentId ?? obj.id));
      const duplicateIdIdx = state.shipments.findIndex(x => String(x.id) === String(obj.id));
      if(existingIdx !== -1 && duplicateIdIdx !== -1 && duplicateIdIdx !== existingIdx){
        alert('ID отгрузки уже существует');
        setInvalid(shipEl.id, 'Дубликат ID');
        return;
      }
      clearInvalid(shipEl.id);
      if(existingIdx === -1){ state.shipments.push(obj); } else { state.shipments[existingIdx] = obj; }
      const ok = await saveShipments(state.shipments);
      if(!ok){ alert('Не удалось сохранить отгрузки'); return; }
      renderShipmentsCrudTable();
      clearShipmentForm();
      // refresh datalist for orders form in case IDs changed
      populateShipmentDatalist();
    };
  }

  // Inventory: events
  if(invEl.btnRefresh){ invEl.btnRefresh.onclick = () => refreshInventory(); }
  if(invEl.btnNew){ invEl.btnNew.onclick = () => clearInventoryForm(); }
  if(invEl.btnCancel){ invEl.btnCancel.onclick = () => clearInventoryForm(); }
  if(invEl.btnSave){
    invEl.btnSave.onclick = async () => {
      const obj = collectInventoryFromForm();
      if(!obj) return;
      const existingIdx = state.inventoryLedger.findIndex(x => String(x.id) === String(state.selectedLedgerId ?? obj.id));
      const duplicateIdIdx = state.inventoryLedger.findIndex(x => String(x.id) === String(obj.id));
      if(existingIdx !== -1 && duplicateIdIdx !== -1 && duplicateIdIdx !== existingIdx){
        alert('ID записи уже существует');
        setInvalid(invEl.id, 'Дубликат ID');
        return;
      }
      clearInvalid(invEl.id);
      if(existingIdx === -1){ state.inventoryLedger.push(obj); } else { state.inventoryLedger[existingIdx] = obj; }
      const ok = await saveInventoryLedger(state.inventoryLedger);
      if(!ok){ alert('Не удалось сохранить леджер'); return; }
      renderInventoryLedgerTable();
      renderInventoryStock();
      clearInventoryForm();
    };
  }

  el.btnAddProduct.onclick = () => { addProduct(); scheduleSave(); };
  el.btnClearAll.onclick = async () => {
    if(!confirm('Очистить все данные?')) return;
    state.deliveryOptions = [];
    state.products = [];
    renderDeliveryList();
    renderProducts();
    recalcAll();
    await saveToCloud();
  };

  // Delivery Modal logic
  function openDeliveryModal(){
    // reset
    el.dmName.value = '';
    el.dmBase.value = '';
    el.dmPerKg.value = '';
    el.dmMinCh.value = '';
    el.dmMinW.value = '';
    el.dmDesc.value = '';
    [el.dmName, el.dmBase, el.dmPerKg, el.dmMinCh, el.dmMinW].forEach(clearInvalid);
    el.deliveryModal.classList.remove('hidden');
    el.deliveryModal.setAttribute('aria-hidden','false');
    el.dmName.focus();
  }
  function closeDeliveryModal(){
    el.deliveryModal.classList.add('hidden');
    el.deliveryModal.setAttribute('aria-hidden','true');
  }
  el.btnOpenDeliveryModal.onclick = openDeliveryModal;
  el.btnDeliveryCancel.onclick = closeDeliveryModal;
  el.btnDeliverySave.onclick = () => {
    const name = (el.dmName.value||'').trim();
    const base = Number(el.dmBase.value);
    const perKg = Number(el.dmPerKg.value);
    const minCh = Number(el.dmMinCh.value||0);
    const minW  = Number(el.dmMinW.value||0);
    const desc = (el.dmDesc.value||'').trim();

    let valid = true;
    if(!validateNonEmptyStr(name)) { setInvalid(el.dmName, 'Название не может быть пустым'); valid = false; } else clearInvalid(el.dmName);
    if(!(validateNonNegativeNum(base))) { setInvalid(el.dmBase, 'Не может быть отрицательным'); valid=false; } else clearInvalid(el.dmBase);
    if(!(validateNonNegativeNum(perKg))) { setInvalid(el.dmPerKg, 'Не может быть отрицательным'); valid=false; } else clearInvalid(el.dmPerKg);
    if(!(validateNonNegativeNum(minCh))) { setInvalid(el.dmMinCh, 'Не может быть отрицательным'); valid=false; } else clearInvalid(el.dmMinCh);
    if(!(validateNonNegativeNum(minW))) { setInvalid(el.dmMinW, 'Не может быть отрицательным'); valid=false; } else clearInvalid(el.dmMinW);
    if(!valid) return;

    state.deliveryOptions.push({
      id: Date.now(),
      name,
      baseFeeRUB: Number(base.toFixed(2)),
      pricePerKgRUB: Number(perKg.toFixed(2)),
      minChargeRUB: Number(minCh.toFixed(2)),
      minWeightKg: Number(minW.toFixed(2)),
      description: desc
    });
    closeDeliveryModal();
    renderDeliveryList();
    renderProducts();
    recalcAll();
    scheduleSave();
  };
  // Close modal on Esc and backdrop click
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !el.deliveryModal.classList.contains('hidden')) closeDeliveryModal(); });
  el.deliveryModal.addEventListener('click', (e) => { if(e.target === el.deliveryModal) closeDeliveryModal(); });

  el.btnUpdateRate.onclick = () => {
    const v = Number(el.currencyRate.value);
    if(!Number.isFinite(v) || v <= 0){ alert('Курс должен быть > 0'); return; }
    state.currencyRate = Number(v.toFixed(2));
    el.currencyRate.value = state.currencyRate.toFixed(2);
    recalcAll();
    scheduleSave();
  };

  el.btnExportXlsx.onclick = () => {
    // Build data and ensure recalculated helpers present
    const rate = Number(state.currencyRate);
    let totalGoods = 0, totalDelivery = 0, totalFinal = 0, totalWeightAll = 0;

    const rows = state.products.map(p => {
      // Recalc to ensure caches
      recalcProduct(p);
      const qty = Number(p.quantity) || 0;
      const unitW = Number(p.weightKg||0);
      const del = state.deliveryOptions.find(d => d.name === p.deliveryOptionName);
      const minW = Number(del?.minWeightKg||0);
      const totalW = Math.max(unitW * qty, minW);
      const goodsRub = Number(p._goodsRUB||0);
      const delRub = Number(p._deliveryCostRUB||0);
      const finalRub = Number((goodsRub + delRub).toFixed(2));

      totalGoods += goodsRub;
      totalDelivery += delRub;
      totalFinal += finalRub;
      totalWeightAll += totalW;

      return {
        'Название': p.name,
        'Ссылка': p.url || '',
        'Вес (кг) за 1 шт': unitW,
        'Количество': qty,
        'Суммарный вес (кг)': Number(totalW.toFixed(3)),
        'Цена (CNY)': Number((Number(p.unitPriceYuan)||0).toFixed(2)),
        'Цена товара (RUB)': Number(goodsRub.toFixed(2)),
        'Вариант доставки': p.deliveryOptionName || '',
        'Стоимость доставки (RUB)': Number(delRub.toFixed(2)),
        'Курс (RUB/CNY)': rate,
        'Итог (RUB)': Number(finalRub.toFixed(2))
      };
    });

    // Totals row
    rows.push({
      'Название': 'ИТОГО:',
      'Ссылка': '',
      'Вес (кг) за 1 шт': '',
      'Количество': '',
      'Суммарный вес (кг)': Number(totalWeightAll.toFixed(3)),
      'Цена (CNY)': '',
      'Цена товара (RUB)': Number(totalGoods.toFixed(2)),
      'Вариант доставки': '',
      'Стоимость доставки (RUB)': Number(totalDelivery.toFixed(2)),
      'Курс (RUB/CNY)': rate,
      'Итог (RUB)': Number(totalFinal.toFixed(2))
    });

    const wb = XLSX.utils.book_new();

    // Define header order explicitly for stable columns in export
    const headers = [
      'Название',
      'Ссылка',
      'Вес (кг) за 1 шт',
      'Количество',
      'Суммарный вес (кг)',
      'Цена (CNY)',
      'Цена товара (RUB)',
      'Вариант доставки',
      'Стоимость доставки (RUB)',
      'Курс (RUB/CNY)',
      'Итог (RUB)'
    ];

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

    // Column widths (characters)
    ws['!cols'] = [
      { wch: 30 }, // Название
      { wch: 40 }, // Ссылка
      { wch: 14 }, // Вес (кг) за 1 шт
      { wch: 12 }, // Количество
      { wch: 16 }, // Суммарный вес (кг)
      { wch: 12 }, // Цена (CNY)
      { wch: 18 }, // Цена товара (RUB)
      { wch: 18 }, // Вариант доставки
      { wch: 22 }, // Стоимость доставки (RUB)
      { wch: 14 }, // Курс (RUB/CNY)
      { wch: 14 }  // Итог (RUB)
    ];

    // AutoFilter over the full data range
    if (ws['!ref']) {
      ws['!autofilter'] = { ref: ws['!ref'] };
    }

    // Freeze the top header row (supported in recent SheetJS builds)
    ws['!freeze'] = { rows: 1 };

    // Make header bold where supported
    for (let c = 0; c < headers.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cellRef]) {
        ws[cellRef].s = Object.assign({}, ws[cellRef].s || {}, { font: { bold: true } });
      }
    }

    // Convert 'Ссылка' column values to hyperlinks
    const linkColIndex = headers.indexOf('Ссылка'); // expected 1 (column B)
    if (ws['!ref'] && linkColIndex >= 0) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let r = range.s.r + 1; r <= range.e.r; r++) { // start from row 2 (skip header)
        const ref = XLSX.utils.encode_cell({ r, c: linkColIndex });
        const cell = ws[ref];
        if (cell && typeof cell.v === 'string' && cell.v.trim()) {
          let url = cell.v.trim();
          if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
          }
          cell.l = { Target: url, Tooltip: 'Открыть ссылку' };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Товары');
    const date = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `china-goods-${date}.xlsx`);
  };

// ==========================
// AI Chat (Claude via /api/ai)
// ==========================
// Build concise system context from current app state
function buildSystemContext(){
  const productsCount = state.products.length;
  const deliveriesCount = state.deliveryOptions.length;
  let sum = 0, totalWeightAll = 0;
  state.products.forEach(p => {
    sum += recalcProduct(p);
    const del = state.deliveryOptions.find(d => d.name === p.deliveryOptionName);
    const minW = Number(del?.minWeightKg||0);
    const qty = Number(p.quantity)||0;
    const unitW = Number(p.weightKg||0);
    totalWeightAll += Math.max(unitW * qty, minW);
  });
  const names = state.deliveryOptions.slice(0,5).map(d => d.name).join(', ');
  return [
    'You are a logistics and cost calculation assistant for a China-to-Russia goods calculator UI.',
    `Currency rate RUB/CNY: ${Number(state.currencyRate).toFixed(2)}`,
    `Products: ${productsCount}, Delivery options: ${deliveriesCount}`,
    `Current total (RUB): ${sum.toFixed(2)}, Total weight (kg): ${totalWeightAll.toFixed(3)}`,
    names ? `Delivery names: ${names}` : ''
  ].filter(Boolean).join('\n');
}

// Minimal safe markdown renderer (links, inline code, bold, italics, line breaks)
function renderMarkdown(text){
  const esc = (s) => s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  let html = esc(String(text || ''));
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italics *text*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // URLs -> links
  html = html.replace(/(https?:\/\/[^\s)]+)(?=\s|$)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // line breaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function appendChat(role, text){
  if(!el.chatMessages) return;
  const wrap = document.createElement('div');
  wrap.style.padding = '8px 10px';
  wrap.style.borderRadius = '8px';
  wrap.style.whiteSpace = 'pre-wrap';
  wrap.style.wordBreak = 'break-word';
  if(role === 'user'){
    wrap.style.background = '#eef2ff';
  } else {
    wrap.style.background = '#f1f5f9';
  }
  if(role === 'assistant'){
    wrap.innerHTML = renderMarkdown(text);
  } else {
    wrap.textContent = text;
  }
  el.chatMessages.appendChild(wrap);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

// Chat history: cloud-backed via /api/chat
let CHAT_CACHE = [];
async function loadChatHistory(){
  try{
    const res = await fetch('/api/chat', { credentials: 'include' });
    if(!res.ok) return [];
    const data = await res.json().catch(()=>({ items: [] }));
    CHAT_CACHE = Array.isArray(data.items) ? data.items : [];
    return CHAT_CACHE;
  }catch{ return []; }
}
async function saveChatHistory(list){
  CHAT_CACHE = Array.isArray(list) ? list : CHAT_CACHE;
  try{
    await fetch('/api/chat', { method: 'PUT', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ items: CHAT_CACHE }) });
  }catch{}
}
async function renderChatHistory(){
  if(!el.chatMessages) return;
  el.chatMessages.innerHTML = '';
  const items = CHAT_CACHE.length ? CHAT_CACHE : await loadChatHistory();
  items.forEach(m => {
    const { role, text, image } = m;
    // text
    appendChat(role, text || '');
    // image preview (if any)
    if(image && image.dataUrl){
      const imgWrap = document.createElement('div');
      imgWrap.style.padding = '6px 0';
      const img = document.createElement('img');
      img.src = image.dataUrl;
      img.alt = image.name || 'attachment';
      img.style.maxWidth = '260px';
      img.style.borderRadius = '6px';
      el.chatMessages.appendChild(imgWrap);
      imgWrap.appendChild(img);
    }
  });
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

async function pushHistory(item){
  CHAT_CACHE.push(Object.assign({ ts: Date.now() }, item));
  await saveChatHistory(CHAT_CACHE);
}

async function sendChat(){
  if(!el.chatInput || !el.chatSend) return;
  const q = (el.chatInput.value || '').trim();
  if(!q) return;
  // prepare optional image
  let imagePayload = null;
  let imagePreview = null;
  if(el.chatFile && el.chatFile.files && el.chatFile.files[0]){
    const file = el.chatFile.files[0];
    if(file && file.type.startsWith('image/')){
      imagePayload = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => {
          const dataUrl = String(fr.result||'');
          const base64 = dataUrl.split(',')[1] || '';
          resolve({ media_type: file.type, data: base64, name: file.name, dataUrl });
        };
        fr.readAsDataURL(file);
      });
      imagePreview = imagePayload.dataUrl;
    }
  }

  appendChat('user', q);
  if(imagePreview){
    const img = document.createElement('img');
    img.src = imagePreview; img.alt = imagePayload?.name||'attachment';
    img.style.maxWidth = '260px'; img.style.borderRadius = '6px';
    el.chatMessages.appendChild(img);
  }
  pushHistory({ role: 'user', text: q, image: imagePayload ? { name: imagePayload.name, dataUrl: imagePreview } : undefined });
  el.chatInput.value = '';
  if(el.chatFile) el.chatFile.value = '';

  const thinking = document.createElement('div');
  thinking.style.padding = '8px 10px';
  thinking.style.borderRadius = '8px';
  thinking.style.background = '#f1f5f9';
  thinking.textContent = '…';
  el.chatMessages.appendChild(thinking);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;

  el.chatSend.disabled = true;
  try{
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text: q, system: buildSystemContext(), image: imagePayload ? { media_type: imagePayload.media_type, data: imagePayload.data } : undefined })
    });
    const data = await res.json().catch(() => ({}));
    thinking.remove();
    if(!res.ok){
      appendChat('assistant', `Ошибка: ${data?.error || res.status}`);
    } else {
      const answer = (data && (data.answer || (Array.isArray(data.raw?.content) ? data.raw.content.map(p => p.text || '').join('\n') : ''))) || '';
      appendChat('assistant', String(answer || ''));
      await pushHistory({ role: 'assistant', text: String(answer||'') });
      // Try auto-detect JSON changes block in the answer
      tryApplyChangesFromAnswer(String(answer||''));
    }
  }catch(e){
    thinking.remove();
    appendChat('assistant', 'Сбой запроса к ИИ');
  } finally {
    el.chatSend.disabled = false;
  }
}

  if(el.chatSend){ el.chatSend.onclick = sendChat; }
  if(el.chatInput){
    el.chatInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        sendChat();
      }
    });
  }
  if(el.chatClear){ el.chatClear.onclick = async () => { try{ await fetch('/api/chat', { method:'DELETE', credentials: 'include' }); }catch{} CHAT_CACHE = []; renderChatHistory(); }; }

  // Parse and apply AI-suggested changes
  function extractJsonFromText(txt){
    if(!txt) return null;
    // try ```json block
    const m = txt.match(/```json\s*([\s\S]*?)```/i);
    if(m && m[1]){
      try { return JSON.parse(m[1]); } catch {}
    }
    // try any JSON object substring
    const idx = txt.indexOf('{');
    const last = txt.lastIndexOf('}');
    if(idx !== -1 && last !== -1 && last > idx){
      const cand = txt.slice(idx, last+1);
      try { return JSON.parse(cand); } catch {}
    }
    return null;
  }

  function tryApplyChangesFromAnswer(answer){
    const obj = extractJsonFromText(answer);
    if(!obj || typeof obj !== 'object') return;
    // Supported shape examples:
    // { currencyRate: 12.34, deliveries:[{name, pricePerKgRUB, minPriceRUB, percentFee, fixedFeeRUB}], products:[{id?, name?, quantity?, unitPriceYuan?, weightKg?, deliveryOptionName?}] }
    const preview = [];
    if(typeof obj.currencyRate === 'number') preview.push(`Курс: ${obj.currencyRate}`);
    if(Array.isArray(obj.deliveries)) preview.push(`Доставки: ${obj.deliveries.length}`);
    if(Array.isArray(obj.products)) preview.push(`Товары: ${obj.products.length}`);
    if(preview.length === 0) return;
    if(!confirm(`ИИ предлагает изменения:\n${preview.join('\n')}\nПрименить?`)) return;
    // apply
    if(typeof obj.currencyRate === 'number' && isFinite(obj.currencyRate) && obj.currencyRate > 0){
      state.currencyRate = Number(obj.currencyRate);
      if(el.currencyRate) el.currencyRate.value = state.currencyRate.toFixed(2);
    }
    if(Array.isArray(obj.deliveries)){
      obj.deliveries.forEach(d => {
        if(!d || typeof d !== 'object' || !d.name) return;
        const existing = state.deliveryOptions.find(x => x.name === d.name);
        const norm = {
          name: String(d.name),
          pricePerKgRUB: Number(d.pricePerKgRUB) || 0,
          minPriceRUB: Number(d.minPriceRUB) || 0,
          percentFee: Number(d.percentFee) || 0,
          fixedFeeRUB: Number(d.fixedFeeRUB) || 0,
        };
        if(existing){
          Object.assign(existing, norm);
        } else {
          state.deliveryOptions.push(norm);
        }
      });
      renderDeliveryList();
    }
    if(Array.isArray(obj.products)){
      obj.products.forEach(p => {
        if(!p || typeof p !== 'object') return;
        let target = null;
        if(p.id){ target = state.products.find(x => String(x.id) === String(p.id)); }
        if(!target && p.name){ target = state.products.find(x => x.name === p.name); }
        const data = {
          name: p.name != null ? String(p.name) : undefined,
          url: p.url != null ? String(p.url) : undefined,
          weightKg: p.weightKg != null ? Number(p.weightKg) : undefined,
          quantity: p.quantity != null ? Number(p.quantity) : undefined,
          unitPriceYuan: p.unitPriceYuan != null ? Number(p.unitPriceYuan) : undefined,
          deliveryOptionName: p.deliveryOptionName != null ? String(p.deliveryOptionName) : undefined,
        };
        if(target){
          Object.keys(data).forEach(k => { if(data[k] !== undefined) target[k] = data[k]; });
          recalcProduct(target);
        } else {
          const np = {
            id: Date.now() + Math.floor(Math.random()*1000),
            name: data.name || 'Товар',
            url: data.url || '',
            weightKg: data.weightKg || 0,
            quantity: data.quantity || 1,
            unitPriceYuan: data.unitPriceYuan || 0,
            deliveryOptionName: data.deliveryOptionName || '',
            finalPriceRUB: 0,
          };
          recalcProduct(np);
          state.products.push(np);
        }
      });
      renderProducts();
    }
    recalcAll();
    scheduleSave();
  }

  // Auth + Startup
  async function initApp(){
    el.authCard.classList.add('hidden');
    el.app.classList.remove('hidden');
    el.currencyRate.value = state.currencyRate.toFixed(2);
    setSaving('saved');
    await loadFromCloud();
    await loadChatHistory();
    renderChatHistory();
    if (typeof setTab === 'function') { setTab('dashboard'); }
  }

  async function checkAuth(){
    try{
      const res = await fetch('/api/auth', { credentials: 'include' });
      const data = await res.json().catch(()=>({ authenticated:false }));
      if(res.ok && (data.authenticated || data.ok)){ await initApp(); }
      else {
        el.app.classList.add('hidden');
        el.authCard.classList.remove('hidden');
      }
    }catch{
      el.app.classList.add('hidden');
      el.authCard.classList.remove('hidden');
    }
  }

  if(el.btnLogin){
    el.btnLogin.onclick = async () => {
      hideAuthError();
      const key = (el.accessKeyInput.value||'').trim();
      if(!key) { showAuthError('Введите ключ доступа'); return; }
      try{
        const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ key }) });
        const data = await res.json().catch(()=>({ authenticated:false }));
        if(res.ok && (data.authenticated || data.ok)){ await initApp(); }
        else { showAuthError(data.error || 'Неверный ключ'); }
      }catch{ showAuthError('Сбой входа'); }
    };
  }

  // Kick off
  checkAuth();
})();
