(function(){
  // App State
  const state = {
    currencyRate: 13.00,
    deliveryOptions: [], // { id, name, baseFeeRUB, pricePerKgRUB, minChargeRUB, minWeightKg, description }
    products: [] // { id, name, url, weightKg, quantity, unitPriceYuan, deliveryOptionName, finalPriceRUB }
  };

  // Cloud persistence (Pages Functions + KV)
  let saveTimer = null;
  function scheduleSave(){
    clearTimeout(saveTimer);
    setSaving('saving');
    saveTimer = setTimeout(saveToCloud, 500);
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

    // AI Chat
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSend: document.getElementById('chatSend'),
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

  // Helpers
  // Legacy auth helpers no longer used
  function showAuthError() {}
  function hideAuthError() {}

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
    wrap.textContent = text;
    el.chatMessages.appendChild(wrap);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }

  async function sendChat(){
    if(!el.chatInput || !el.chatSend) return;
    const q = (el.chatInput.value || '').trim();
    if(!q) return;
    appendChat('user', q);
    el.chatInput.value = '';

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
        body: JSON.stringify({ text: q })
      });
      const data = await res.json().catch(() => ({}));
      thinking.remove();
      if(!res.ok){
        appendChat('assistant', `Ошибка: ${data?.error || res.status}`);
      } else {
        const answer = (data && (data.answer || (Array.isArray(data.raw?.content) ? data.raw.content.map(p => p.text || '').join('\n') : ''))) || '';
        appendChat('assistant', String(answer || ''));
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

  // Startup: auth removed — show app immediately and load cloud data
  el.authCard.classList.add('hidden');
  el.app.classList.remove('hidden');
  el.currencyRate.value = state.currencyRate.toFixed(2);
  setSaving('saved');
  loadFromCloud();
})();
