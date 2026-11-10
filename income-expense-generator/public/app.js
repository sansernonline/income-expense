/* หน้าจอ IEGEN: ตาราง (ซ้าย) + แผงตั้งค่า (ขวา) + ส่งออก Excel (ตรรกะอยู่ใน ledger.js / plan.js / presets.js) */
(function () {
  const { generate, expectedRevenue, sortRows, moveRow, balances, totals, toMoney, monthsIn, dayCount, eachDay, weekday, MAX_DAYS, FALLBACK_PLAN, sanitizePlan, sanitizeSettings, LIMITS, PRESETS } = window.IE;
  const $ = (id) => document.getElementById(id);
  const KEY = 'iegen.v1';
  const OTHER = 'other';
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const FREQ = { daily: 'ทุกวัน', weekly: 'รายสัปดาห์', monthly: 'รายเดือน' };
  const WDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const thDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${Number(y) + 543}`; };

  function defaults() {
    const n = new Date();
    const start = isoLocal(new Date(n.getFullYear(), n.getMonth(), 1));
    const end = isoLocal(new Date(n.getFullYear(), n.getMonth() + 1, 0));
    return { settings: { type: '', biz: '', start, end, opening: 0, mode: 'month', monthMin: 80000, monthMax: 100000, dayMin: 2000, dayMax: 5000, monthlyRevenue: {}, closedWeekdays: [0], closedDates: [], margin: '', weekendPct: 30, jitterPct: 25, season: {}, seasonPct: 25, txMin: 1, txMax: 2, seed: '' }, rows: [], plan: null, prevRows: null, nextId: 1 };
  }
  let state = load();
  /** เติมค่าที่ขาดให้ข้อมูลที่เก็บไว้ (localStorage หรือชุดจากประวัติ) · รูปไม่ถูกคืน null */
  function normalize(s) {
    if (!(s && s.settings && Array.isArray(s.rows))) return null;
    const d = defaults(); const st = s.settings; delete s.chat;
    if (st.defaultRevenue && st.monthMin === undefined) st.monthMin = st.monthMax = st.defaultRevenue; // ข้อมูลรุ่นเก่า
    return Object.assign(d, s, { settings: Object.assign(d.settings, st) });
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))) || defaults(); } catch (e) { return defaults(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* โหมดส่วนตัว: ไม่เก็บ */ } }

  const S = () => state.settings;
  const validRange = () => S().start && S().end && S().start <= S().end && dayCount(S().start, S().end) <= MAX_DAYS;
  /** ข้อความบอกว่าช่วงวันที่ผิดตรงไหน (FR-SET-020) · ถูกแล้วคืนข้อความว่าง */
  const rangeError = () => (!S().start || !S().end ? 'กรอกวันที่เริ่มและวันที่สิ้นสุดให้ครบ' : S().start > S().end ? 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' : dayCount(S().start, S().end) > MAX_DAYS ? `ช่วงวันที่ต้องไม่เกิน ${MAX_DAYS} วัน` : '');

  /* ---------- ตั้งค่า ---------- */

  function renderSettings() {
    $('mmin').value = S().monthMin; $('mmax').value = S().monthMax; $('dmin').value = S().dayMin; $('dmax').value = S().dayMax;
    document.querySelectorAll('#mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === S().mode));
    if (validRange()) {
      const open = eachDay(S().start, S().end).filter((d) => !S().closedWeekdays.includes(weekday(d)) && !S().closedDates.includes(d)).length;
      const per = open / monthsIn(S().start, S().end).length;
      const k = (n) => Math.round(n).toLocaleString('th-TH');
      $('day-est').textContent = `ประมาณเดือนละ ${k(per * S().dayMin)} – ${k(per * S().dayMax)} บาท (เปิดเฉลี่ย ${per.toFixed(1)} วัน/เดือน)`;
    }
    $('box-month').hidden = S().mode !== 'month'; $('box-day').hidden = S().mode !== 'day';
    $('biz').value = S().biz; $('start').value = S().start; $('end').value = S().end; $('opening').value = S().opening || '';
    const box = $('months'), keys = validRange() ? monthsIn(S().start, S().end) : [];
    if (box.dataset.keys === keys.join()) box.querySelectorAll('input').forEach((i) => { if (document.activeElement !== i) i.value = S().monthlyRevenue[i.dataset.m] || ''; }); // ไม่สร้างใหม่ถ้าเดือนเท่าเดิม (กันคลิกหลุดตอนช่องเสียโฟกัส)
    else { box.dataset.keys = keys.join(); box.textContent = ''; for (const m of keys) {
      const [y, mo] = m.split('-');
      const l = document.createElement('label');
      l.append(`${mo}/${Number(y) + 543}`);
      const i = document.createElement('input'); i.type = 'number'; i.min = '0'; i.step = '1'; i.placeholder = 'สุ่มในช่วง'; i.value = S().monthlyRevenue[m] || ''; i.dataset.m = m; i.setAttribute('aria-label', `รายรับเป้าหมายเดือน ${mo}/${Number(y) + 543}`);
      l.append(withUnit(i, 'บาท')); box.append(l);
    } }
    const w = $('wdays');
    if (!w.children.length) WDAYS.forEach((name, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = name; b.dataset.wd = i; b.title = 'หยุดวัน' + name; w.append(b);
    });
    [...w.children].forEach((b, i) => b.setAttribute('aria-pressed', S().closedWeekdays.includes(i)));
    $('closed-count').textContent = `(${S().closedDates.length})`;
    const c = $('closed-dates'); c.textContent = '';
    for (const d of S().closedDates) {
      const s = document.createElement('span'); s.className = 'chip date'; s.textContent = thDate(d);
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.dataset.rm = d; x.setAttribute('aria-label', 'ลบวันหยุด ' + thDate(d));
      s.append(x); c.append(s);
    }
    renderTypes(); renderAdv();
    const err = rangeError();
    $('settings-err').hidden = !err; $('settings-err').textContent = err;
  }

  function bindSettings() {
    $('biz').addEventListener('input', (e) => { S().biz = e.target.value; save(); });
    for (const id of ['start', 'end']) $(id).addEventListener('change', (e) => { S()[id] = e.target.value; save(); renderSettings(); });
    $('opening').addEventListener('change', (e) => { S().opening = toMoney(e.target.value); e.target.value = S().opening || ''; save(); refreshBalances(); });
    $('months').addEventListener('change', (e) => {
      const v = Math.max(0, Number(e.target.value) || 0);
      if (v) S().monthlyRevenue[e.target.dataset.m] = v; else delete S().monthlyRevenue[e.target.dataset.m];
      e.target.value = v || ''; save(); renderExpSum();
    });
    $('mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; S().mode = b.dataset.mode; save(); renderSettings(); });
    for (const [lo, hi, a, b] of [['mmin', 'mmax', 'monthMin', 'monthMax'], ['dmin', 'dmax', 'dayMin', 'dayMax']]) {
      for (const id of [lo, hi]) $(id).addEventListener('change', () => {
        let x = Math.max(0, Number($(lo).value) || 0), y = Math.max(0, Number($(hi).value) || 0);
        if (x > y) [x, y] = [y, x]; // ใส่สลับก็ใช้ได้
        S()[a] = x; S()[b] = y; save(); renderSettings();
      });
    }
    $('wdays').addEventListener('click', (e) => {
      const b = e.target.closest('[data-wd]'); if (!b) return; const i = Number(b.dataset.wd);
      S().closedWeekdays = S().closedWeekdays.includes(i) ? S().closedWeekdays.filter((x) => x !== i) : [...S().closedWeekdays, i].sort(); save(); renderSettings();
    });
    $('btn-closed-add').addEventListener('click', () => {
      const d = $('closed-new').value; if (!d || S().closedDates.includes(d)) return;
      S().closedDates = [...S().closedDates, d].sort(); $('closed-new').value = ''; save(); renderSettings();
    });
    $('closed-dates').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; S().closedDates = S().closedDates.filter((d) => d !== b.dataset.rm); save(); renderSettings(); });
  }

  /* ---------- ประเภทธุรกิจ + หมวดรายรับ/รายจ่าย ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const typeLabel = (id) => (id === OTHER ? 'อื่น ๆ (พิมพ์เอง)' : (PRESETS.find((p) => p.id === id) || {}).label || '');
  const mk = (tag, props, label) => { const e = document.createElement(tag); Object.assign(e, props); if (label) e.setAttribute('aria-label', label); return e; };
  /** ห่อช่องตัวเลขให้มีหน่วยต่อท้าย (% · บาท) — หน้าตาอยู่ที่ .unit ใน styles.css */
  const withUnit = (input, u) => { const s = mk('span', { className: 'unit' }); s.dataset.unit = u; s.append(input); return s; };

  function renderTypes() {
    const box = $('types');
    if (!box.children.length) for (const id of [...PRESETS.map((p) => p.id), OTHER]) {
      const b = mk('button', { type: 'button', className: 'chip', textContent: typeLabel(id) }); b.dataset.type = id; box.append(b);
    }
    [...box.children].forEach((b) => b.setAttribute('aria-pressed', S().type === b.dataset.type));
    $('other-box').hidden = S().type !== OTHER; $('btn-ai').hidden = !S().type;
  }

  function selectType(id) {
    S().type = id;
    if (id === OTHER) {
      if (!state.plan) state.plan = clone(FALLBACK_PLAN);
      toast('ใช้หมวดมาตรฐานกลาง · พิมพ์ประเภทธุรกิจแล้วกด “ให้ AI ปรับหมวด” หรือแก้เองได้');
    } else {
      const p = PRESETS.find((x) => x.id === id);
      state.plan = clone({ revenue: p.revenue, expenses: p.expenses });
      Object.assign(S(), p.income, { monthlyRevenue: {} });
      toast(`ใส่หมวดและช่วงรายรับตั้งต้นของ “${p.label}” แล้ว · ค่าเป็นค่าสมมติ ปรับได้`);
    }
    save(); renderSettings(); renderPlan();
    if (id === OTHER) $('biz').focus();
  }

  function head(...cols) {
    const row = mk('div', { className: 'prow head' + (cols.length > 3 ? ' exp' : '') });
    for (const c of cols) { const s = mk('span'); if (c) { s.append(c[0]); s.append(mk('small', { textContent: c[1] })); } row.append(s); }
    row.append(mk('span')); return row;
  }

  function renderPlan() {
    const rev = $('rev-list'), exp = $('exp-list'); rev.textContent = ''; exp.textContent = '';
    const P = state.plan; if (!P) return renderExpSum();
    if (P.revenue.length) rev.append(head(['ชื่อหมวด', 'รายรับมาจากอะไร'], ['สัดส่วน', 'เทียบกัน']));
    if (P.expenses.length) exp.append(head(['ชื่อหมวด', 'จ่ายค่าอะไร'], ['%', 'ของรายรับ'], ['ความถี่', 'จ่ายบ่อยแค่ไหน'], ['วันที่', 'รายเดือน']));
    P.revenue.forEach((r, i) => {
      const row = mk('div', { className: 'prow' }); row.dataset.k = 'revenue'; row.dataset.i = i;
      const n = mk('input', { type: 'text', maxLength: LIMITS.name, value: r.name }, 'ชื่อหมวดรายรับ'); n.dataset.f = 'name';
      const w = mk('input', { type: 'number', min: '1', max: '100', step: '1', value: r.weight }, 'สัดส่วนของหมวดรายรับ'); w.dataset.f = 'weight';
      row.append(n, w, mk('button', { type: 'button', className: 'rm', textContent: '×' }, 'ลบหมวดรายรับนี้')); rev.append(row);
    });
    P.expenses.forEach((e, i) => {
      const row = mk('div', { className: 'prow exp' }); row.dataset.k = 'expenses'; row.dataset.i = i;
      const n = mk('input', { type: 'text', maxLength: LIMITS.name, value: e.name }, 'ชื่อหมวดรายจ่าย'); n.dataset.f = 'name';
      const p = mk('input', { type: 'number', min: '0', max: '60', step: '0.5', value: e.pct }, 'ร้อยละของรายรับ'); p.dataset.f = 'pct';
      const f = mk('select', {}, 'ความถี่ที่จ่าย'); f.dataset.f = 'freq';
      for (const [v, t] of Object.entries(FREQ)) f.append(mk('option', { value: v, textContent: t, selected: v === e.freq }));
      let d = mk('span');
      if (e.freq === 'monthly') { d = mk('input', { type: 'number', min: '1', max: '28', step: '1', value: e.day || 1, placeholder: 'วันที่' }, 'จ่ายวันที่ของเดือน'); d.dataset.f = 'day'; }
      row.append(n, withUnit(p, '%'), f, d, mk('button', { type: 'button', className: 'rm', textContent: '×' }, 'ลบหมวดรายจ่ายนี้'));
      exp.append(row);
    });
    renderExpSum();
  }

  const r1 = (n) => Math.round(n * 10) / 10;
  /** รายรับที่คาดทั้งช่วงวันที่ (ค่ากลางของช่วงสุ่ม) · 0 = คิดไม่ได้ */
  const expectedRev = () => (validRange() ? expectedRevenue(S()) : 0);
  /** ช่องรายจ่ายรวม (%) / คงเหลือทั้งช่วง (บาท): S().margin ว่าง = ตามผลรวมหมวด · มีค่า = กำไร % ที่ผู้ใช้ตั้ง (ledger เกลี่ยให้ตรงตอนสร้าง) */
  function renderExpSum() {
    const el = $('exp-sum'), P = state.plan, m = S().margin, set = m !== '' && m != null, rev = expectedRev();
    $('exp-total').disabled = !P; $('remain').disabled = !P || rev <= 0;
    if (!P) { el.textContent = $('exp-total').value = $('remain').value = ''; return; }
    const sum = r1(P.expenses.reduce((a, e) => a + (Number(e.pct) || 0), 0)), total = set ? r1(100 - m) : sum;
    $('exp-total').value = total;
    $('remain').value = rev > 0 ? Math.round((rev * Math.max(0, set ? m : 100 - sum)) / 100) : '';
    el.textContent = !set && sum > 100 ? 'ขาดทุน (รายจ่ายเกินรายรับ)'
      : set && sum !== total ? `บางหมวดเกิน 60% · ตอนสร้างรายการ ระบบเกลี่ยทุกหมวดให้รวมเป็น ${total}%` : '';
  }
  /** ตั้งรายจ่ายรวม (% ของรายรับ) แล้วเกลี่ยลงทุกหมวดตามสัดส่วนเดิม · หมวดเดียวไม่เกิน 60% */
  function setExpenseTotal(total) {
    const E = state.plan.expenses, sum = E.reduce((a, e) => a + (Number(e.pct) || 0), 0);
    S().margin = Math.round((100 - total) * 1e4) / 1e4; // ไม่ปัด 0.1% — ยอดบาทที่กรอกต้องกลับมาเท่าเดิม
    E.forEach((e) => { e.pct = Math.min(60, r1(sum > 0 ? ((Number(e.pct) || 0) * total) / sum : total / E.length)); });
    // แก้ค่าในช่องเดิม ไม่สร้างแถวใหม่ — ช่องที่ผู้ใช้เพิ่งคลิกต่อจะไม่หลุดโฟกัส
    $('exp-list').querySelectorAll('[data-f=pct]').forEach((el, i) => { el.value = E[i].pct; });
    save(); renderExpSum();
  }

  const FIELD = { pct: [0, 60, 0], day: [1, 28, 1], weight: [1, 100, 1] };
  function bindPlan() {
    for (const id of ['rev-list', 'exp-list']) {
      const box = $(id);
      const itemOf = (el) => { const row = el.closest('.prow'); return row && { row, list: state.plan[row.dataset.k], i: Number(row.dataset.i) }; };
      box.addEventListener('input', (e) => {
        const f = e.target.dataset.f, at = itemOf(e.target); if (!at || !f || f === 'freq') return;
        at.list[at.i][f] = f === 'name' ? e.target.value : Number(e.target.value);
        if (f === 'pct') S().margin = ''; // แก้หมวดเอง → ช่องรายจ่ายรวมกลับไปตามผลรวมหมวด
        save(); renderExpSum();
      });
      box.addEventListener('change', (e) => {
        const at = itemOf(e.target), key = e.target.dataset.f;
        if (at && FIELD[key]) { // ปรับค่านอกช่วงเป็นค่าขอบ ไม่ปฏิเสธ (D-06): % 0–60 · วันที่ 1–28 · สัดส่วน 1–100
          const [lo, hi, dflt] = FIELD[key], v = e.target.value === '' ? dflt : Math.min(hi, Math.max(lo, Number(e.target.value) || lo));
          at.list[at.i][key] = key === 'pct' ? v : Math.round(v); e.target.value = at.list[at.i][key]; save(); renderExpSum(); return;
        }
        if (key !== 'freq') return;
        const it = at.list[at.i], f = e.target.value;
        if (f !== it.freq && state.plan.expenses.filter((x) => x.freq === f).length >= LIMITS[f]) toast(`หมวด “${FREQ[f]}” เต็มแล้ว (ไม่เกิน ${LIMITS[f]} หมวด)`);
        else { it.freq = f; if (f === 'monthly') it.day = it.day || 1; else delete it.day; save(); }
        renderPlan();
      });
      box.addEventListener('click', (e) => {
        if (!e.target.closest('.rm')) return;
        const at = itemOf(e.target); at.list.splice(at.i, 1); if (at.row.dataset.k === 'expenses') S().margin = ''; save(); renderPlan();
      });
    }
    // กรอกช่องใดก็แปลงเป็นรายจ่าย % (5–100 = กำไร 0–95) แล้วเกลี่ยลงหมวด
    const totalBox = (id, toTotal) => $(id).addEventListener('change', (e) => {
      if (!state.plan) return;
      if (e.target.value === '') { S().margin = ''; save(); return renderExpSum(); }
      setExpenseTotal(Math.min(100, Math.max(5, toTotal(Number(e.target.value) || 0))));
    });
    totalBox('exp-total', (pct) => pct);
    totalBox('remain', (baht) => 100 - (baht / expectedRev()) * 100);
    $('btn-rev-add').addEventListener('click', () => {
      if (!state.plan) return toast('เลือกประเภทธุรกิจก่อน');
      if (state.plan.revenue.length >= LIMITS.revenue) return toast(`หมวดรายรับไม่เกิน ${LIMITS.revenue} หมวด`);
      state.plan.revenue.push({ name: 'รายรับใหม่', weight: 10 }); save(); renderPlan(); const l = [...$('rev-list').querySelectorAll('[data-f=name]')].pop(); l.focus(); l.select();
    });
    $('btn-exp-add').addEventListener('click', () => {
      if (!state.plan) return toast('เลือกประเภทธุรกิจก่อน');
      const freq = ['monthly', 'weekly', 'daily'].find((f) => state.plan.expenses.filter((x) => x.freq === f).length < LIMITS[f]);
      if (!freq) return toast('หมวดรายจ่ายเต็มแล้ว ลบหมวดเดิมก่อน');
      state.plan.expenses.push(freq === 'monthly' ? { name: 'รายจ่ายใหม่', pct: 1, freq, day: 1 } : { name: 'รายจ่ายใหม่', pct: 1, freq });
      S().margin = ''; save(); renderPlan(); const l = [...$('exp-list').querySelectorAll('[data-f=name]')].pop(); l.focus(); l.select();
    });
  }

  /* ---------- เดือนที่ขายดี/ซบเซา และความละเอียด ---------- */
  const ADV_NUM = { weekendPct: [0, 100, 30], seasonPct: [0, 60, 25], jitterPct: [0, 60, 25], txMin: [1, 6, 1], txMax: [1, 6, 2] };
  function renderAdv() {
    for (const id of [...Object.keys(ADV_NUM), 'seed']) $(id).value = S()[id];
    const box = $('season');
    if (!box.children.length) MONTHS.forEach((name, i) => { const b = mk('button', { type: 'button', className: 'chip' }); b.dataset.m = i + 1; box.append(b); });
    [...box.children].forEach((b, i) => {
      const k = S().season[i + 1];
      b.textContent = MONTHS[i] + (k === 'peak' ? ' ▲' : k === 'slow' ? ' ▼' : '');
      b.setAttribute('aria-label', `${MONTHS[i]} ${k === 'peak' ? 'ขายดี' : k === 'slow' ? 'ซบเซา' : 'ปกติ'}`); b.dataset.season = k || '';
    });
    renderExpSum(); // เดือนขายดี/ซบเซาเปลี่ยนรายรับที่คาด → ยอดคงเหลือ (บาท) เปลี่ยนตาม (renderSettings ก็เรียกผ่านทางนี้)
  }
  function bindAdv() {
    for (const [id, [lo, hi, dflt]] of Object.entries(ADV_NUM)) {
      $(id).addEventListener('change', (e) => {
        S()[id] = e.target.value === '' ? dflt : Math.min(hi, Math.max(lo, Math.round(Number(e.target.value)) || lo));
        if (S().txMin > S().txMax) { if (id === 'txMin') S().txMax = S().txMin; else S().txMin = S().txMax; }
        save(); renderAdv();
      });
    }
    $('seed').addEventListener('input', (e) => { S().seed = e.target.value; save(); });
    $('season').addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const cur = S().season[b.dataset.m], next = cur === undefined ? 'peak' : cur === 'peak' ? 'slow' : undefined;
      if (next) S().season[b.dataset.m] = next; else delete S().season[b.dataset.m];
      save(); renderAdv();
    });
    $('types').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) selectType(b.dataset.type); });
  }

  /* ---------- ให้ AI ปรับหมวด (แทนช่องแชต) ---------- */
  let aiBusy = false;
  async function askAi() {
    if (aiBusy) return; // กดซ้ำระหว่างรอ ส่งคำขอเดียว
    const text = S().type === OTHER ? (S().biz || '').trim() : typeLabel(S().type);
    if (!text) { if (S().type) $('biz').focus(); return toast(S().type ? 'พิมพ์ประเภทธุรกิจของคุณก่อน' : 'เลือกประเภทธุรกิจก่อน'); }
    const btn = $('btn-ai'), note = $('ai-note'); aiBusy = true; btn.disabled = true; btn.textContent = 'กำลังคิด…'; note.textContent = '';
    let res;
    try {
      const r = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, today: isoLocal(new Date()) }) });
      if (r.status === 401) window.IE.auth.expired((await r.json().catch(() => ({}))).error); // เซสชันหมดอายุ กลับหน้า login
      res = r.ok ? await r.json() : { note: r.status === 429 ? 'ขอบ่อยเกินไป รอสักครู่แล้วลองใหม่' : r.status === 401 ? 'ต้องใส่รหัสผ่านก่อน' : 'เซิร์ฟเวอร์ตอบไม่สำเร็จ' };
    } catch (e) {
      res = { note: 'ติดต่อเซิร์ฟเวอร์ไม่ได้' };
    }
    aiBusy = false; btn.disabled = false; btn.textContent = 'ให้ AI ปรับหมวด';
    const plan = res.source === 'typhoon' ? sanitizePlan(res.plan) : null;
    if (!plan) { note.textContent = (res.note ? res.note.replace(/ จึงใช้แม่แบบกลาง$/, '') : 'AI ใช้ไม่ได้ในตอนนี้') + ' · คงหมวดเดิมไว้'; return; }
    if (!S().type) S().type = OTHER;
    state.plan = plan; applyAiSettings(res.settings || {});
    note.textContent = 'AI ปรับหมวดให้แล้ว · ตรวจและแก้ต่อได้';
  }

  function applyAiSettings(raw) {
    const s = sanitizeSettings({ monthlyRevenueMin: raw.monthMin, monthlyRevenueMax: raw.monthMax, startDate: raw.startDate, endDate: raw.endDate }); // ตรวจซ้ำฝั่งเบราว์เซอร์ (NFR-SEC-020)
    if (s.startDate && s.endDate) { S().start = s.startDate; S().end = s.endDate; S().monthlyRevenue = {}; }
    if (s.monthMin) { S().monthMin = s.monthMin; S().monthMax = s.monthMax; S().mode = 'month'; S().monthlyRevenue = {}; }
    save(); renderSettings(); renderPlan();
  }

  /** กด “สร้างรายการ” (quiet = true จากปุ่มสุ่มใหม่ ไม่ต้องแจ้งผลซ้ำ) */
  function generateNow(quiet) {
    if (!S().type || !state.plan) { switchTab('settings'); toast('เลือกประเภทธุรกิจก่อน'); return false; }
    if (!validRange()) { switchTab('settings'); toast(`ตรวจช่วงวันที่ก่อน · ${rangeError()}`); return false; }
    const plan = sanitizePlan(state.plan);
    if (!plan) { toast('ต้องมีอย่างน้อย 1 หมวดรายรับและ 1 หมวดรายจ่าย ตั้งชื่อให้ครบ'); return false; }
    state.plan = plan; renderPlan();
    runGenerate();
    if (quiet === true) return true;
    const t = totals(state.rows, S().opening);
    toast(t.count ? `สร้างให้ ${t.count} รายการ · ไม่พอใจกด “ย้อนกลับ” ได้` : 'ไม่ได้สร้างรายการ เพราะทุกวันเป็นวันหยุด หรือรายรับเป็น 0');
    if (window.innerWidth <= 860) switchTab('ledger');
    return true;
  }

  /* ---------- สร้างรายการ ---------- */
  function runGenerate() {
    state.prevRows = state.rows;
    state.rows = generate({ ...S(), closedWeekdays: S().closedWeekdays, closedDates: S().closedDates }, state.plan || FALLBACK_PLAN)
      .map((r) => ({ ...r, id: state.nextId++ }));
    save(); renderTable();
  }

  /* ---------- ตาราง ---------- */
  function renderTable() {
    const body = $('rows'); body.textContent = '';
    for (const r of state.rows) {
      const tr = document.createElement('tr'); tr.dataset.id = r.id;
      tr.innerHTML = '<td class="g"><button class="grip" type="button" aria-label="ลากเพื่อย้ายแถว หรือกดลูกศรขึ้น/ลง" title="ลากเพื่อย้าย · วันที่จะเปลี่ยนตามแถวด้านบน"><svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="4.5" cy="3" r="1.3"/><circle cx="9.5" cy="3" r="1.3"/><circle cx="4.5" cy="7" r="1.3"/><circle cx="9.5" cy="7" r="1.3"/><circle cx="4.5" cy="11" r="1.3"/><circle cx="9.5" cy="11" r="1.3"/></svg></button></td>' +
        '<td><input type="date" data-f="date" aria-label="วันที่"></td><td><input type="text" data-f="name" maxlength="60" aria-label="รายการ"></td>' +
        '<td><input type="text" class="num" inputmode="decimal" data-f="income" aria-label="รายรับ"></td><td><input type="text" class="num" inputmode="decimal" data-f="expense" aria-label="รายจ่าย"></td>' +
        '<td class="bal"></td><td class="x"><button class="del" type="button" aria-label="ลบรายการนี้">×</button></td>';
      tr.querySelector('[data-f=date]').value = r.date; tr.querySelector('[data-f=name]').value = r.name;
      tr.querySelector('[data-f=income]').value = r.income || ''; tr.querySelector('[data-f=expense]').value = r.expense || '';
      body.append(tr);
    }
    $('empty').hidden = state.rows.length > 0;
    $('tbl').hidden = state.rows.length === 0;
    refreshBalances();
  }
  function refreshBalances() {
    const bal = balances(state.rows, S().opening);
    [...$('rows').children].forEach((tr, i) => { const c = tr.querySelector('.bal'); c.textContent = fmt(bal[i]); c.classList.toggle('neg', bal[i] < 0); });
    const t = totals(state.rows, S().opening);
    $('s-in').textContent = fmt(t.income); $('s-out').textContent = fmt(t.expense); $('s-bal').textContent = fmt(t.balance); $('s-n').textContent = t.count;
    $('tab-count').textContent = t.count ? `(${t.count})` : '';
    $('btn-undo').disabled = !state.prevRows; $('btn-export').disabled = !t.count; $('btn-regen').disabled = !state.rows.length;
  }
  const rowOf = (el) => state.rows.find((r) => r.id === Number(el.closest('tr').dataset.id));

  function bindTable() {
    $('rows').addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (f !== 'income' && f !== 'expense') return;
      const raw = e.target.value.trim().replace(/,/g, ''), n = Number(raw);
      if (raw !== '' && (!Number.isFinite(n) || n < 0)) return toast('จำนวนเงินต้องเป็นตัวเลขที่ไม่ติดลบ'); // ไม่รับ ค่ากลับเป็นเดิมเมื่อออกจากช่อง (BR-020)
      const r = rowOf(e.target); r[f] = toMoney(raw);
      if (r[f] > 0) { const other = f === 'income' ? 'expense' : 'income'; r[other] = 0; e.target.closest('tr').querySelector(`[data-f=${other}]`).value = ''; } // BR-010
      save(); refreshBalances();
    });
    $('rows').addEventListener('change', (e) => {
      const f = e.target.dataset.f; if (!f) return; const r = rowOf(e.target);
      if (f === 'name') r.name = e.target.value.trim(); else if (f === 'date') { if (!e.target.value) { e.target.value = r.date; return toast('วันที่ไม่ถูกต้อง กรอกวันที่ให้ครบ'); } r.date = e.target.value; state.rows = sortRows(state.rows); } else e.target.value = r[f] || '';
      save(); if (f === 'date') renderTable();
    });
    $('rows').addEventListener('click', (e) => { if (!e.target.closest('.del')) return; const r = rowOf(e.target); state.rows = state.rows.filter((x) => x !== r); save(); renderTable(); });
    $('btn-add').addEventListener('click', () => {
      const date = state.rows.length ? state.rows[state.rows.length - 1].date : S().start;
      state.rows = sortRows([...state.rows, { id: state.nextId++, date, name: 'รายการใหม่', income: 0, expense: 0 }]); save(); renderTable();
      const last = [...$('rows').querySelectorAll('[data-f=name]')].pop(); last.focus(); last.select();
    });
    $('btn-regen').addEventListener('click', () => { if (generateNow(true)) toast(S().seed !== '' ? 'ล็อกผลสุ่มอยู่ ผลจึงเหมือนเดิม · ล้างช่อง “ล็อกผลสุ่ม” เพื่อสุ่มใหม่' : 'สุ่มรายการใหม่แล้ว'); });
    bindDrag();
    $('btn-undo').addEventListener('click', () => { if (!state.prevRows) return; state.rows = state.prevRows; state.prevRows = null; save(); renderTable(); toast('ย้อนกลับแล้ว'); });
  }

  /* ---------- ลากย้ายแถว (เมาส์ นิ้ว และลูกศรขึ้น/ลงบนปุ่มจับ) ---------- */
  function placeRow(from, to) {
    if (to === from || to < 0 || to >= state.rows.length) return;
    const before = state.rows[from].date;
    state.rows = moveRow(state.rows, from, to); save(); renderTable();
    const moved = state.rows[to];
    $('rows').children[to].querySelector('.grip').focus();
    if (moved.date !== before) toast(`ย้ายแล้ว · วันที่เปลี่ยนเป็น ${thDate(moved.date)}`);
  }
  function bindDrag() {
    const body = $('rows'), wrap = body.closest('.tablewrap');
    let drag = null;
    const clearMarks = () => body.querySelectorAll('.drop-before,.drop-after').forEach((tr) => tr.classList.remove('drop-before', 'drop-after'));
    /** แถวแรกที่จุดกึ่งกลางอยู่ต่ำกว่าเคอร์เซอร์ = แทรกก่อนแถวนั้น · ไม่มี = ต่อท้าย */
    const slotAt = (y) => { const trs = [...body.children]; const i = trs.findIndex((tr) => { const b = tr.getBoundingClientRect(); return y < b.top + b.height / 2; }); return i < 0 ? trs.length : i; };
    body.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.grip'); if (!g || e.button !== 0) return;
      e.preventDefault(); // กันเลือกข้อความ แต่ทำให้ช่องที่กำลังพิมพ์ไม่เสียโฟกัสเอง → blur ให้ค่าที่พิมพ์ค้างถูกบันทึกก่อนย้าย
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (!g.isConnected) return; // แก้วันที่ค้างไว้ ตารางวาดใหม่แล้ว ปุ่มจับเดิมหายไป
      g.setPointerCapture(e.pointerId);
      const tr = g.closest('tr'); drag = { tr, from: [...body.children].indexOf(tr), slot: null };
      tr.classList.add('dragging'); document.body.classList.add('is-dragging');
    });
    body.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const w = wrap.getBoundingClientRect(); // ลากชิดขอบบน/ล่างแล้วเลื่อนตารางตาม
      if (e.clientY < w.top + 40) wrap.scrollTop -= 12; else if (e.clientY > w.bottom - 40) wrap.scrollTop += 12;
      const slot = slotAt(e.clientY), trs = body.children; clearMarks();
      drag.slot = slot === drag.from || slot === drag.from + 1 ? null : slot; // วางที่เดิม ไม่ต้องแสดงเส้น
      if (drag.slot === null) return;
      if (slot < trs.length) trs[slot].classList.add('drop-before'); else trs[trs.length - 1].classList.add('drop-after');
    });
    const end = () => {
      if (!drag) return; const { tr, from, slot } = drag; drag = null;
      tr.classList.remove('dragging'); document.body.classList.remove('is-dragging'); clearMarks();
      if (slot !== null) placeRow(from, slot > from ? slot - 1 : slot);
    };
    body.addEventListener('pointerup', end); body.addEventListener('pointercancel', end);
    body.addEventListener('keydown', (e) => {
      if (!e.target.closest('.grip') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault(); const from = [...body.children].indexOf(e.target.closest('tr'));
      placeRow(from, from + (e.key === 'ArrowUp' ? -1 : 1));
    });
  }

  /* ---------- ส่งออก Excel ---------- */
  function exportXlsx() {
    if (typeof XLSX === 'undefined') return toast('โหลดตัวส่งออก Excel ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่');
    const rows = state.rows, op = S().opening || 0, bal = balances(rows, op);
    const serial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
    const ws = {}; const put = (a, c) => { ws[a] = c; };
    ['วันที่', 'รายการ', 'รายรับ', 'รายจ่าย', 'คงเหลือ'].forEach((h, i) => put('ABCDE'[i] + '1', { t: 's', v: h }));
    let r = 2;
    if (op) { put('A' + r, { t: 's', v: '' }); put('B' + r, { t: 's', v: 'ยอดยกมา' }); put('E' + r, { t: 'n', v: op, z: '#,##0.00' }); r++; }
    const firstData = r;
    rows.forEach((row, i) => {
      put('A' + r, { t: 'n', v: serial(row.date), z: 'dd/mm/yyyy' }); put('B' + r, { t: 's', v: row.name });
      if (row.income) put('C' + r, { t: 'n', v: row.income, z: '#,##0.00' }); if (row.expense) put('D' + r, { t: 'n', v: row.expense, z: '#,##0.00' });
      const prev = r === 2 ? '0' : 'E' + (r - 1);
      put('E' + r, { t: 'n', v: bal[i], f: `${prev}+C${r}-D${r}`, z: '#,##0.00' }); r++;
    });
    const last = r - 1, t = totals(rows, op);
    put('B' + r, { t: 's', v: 'รวม' });
    put('C' + r, { t: 'n', v: t.income, f: `SUM(C${firstData}:C${last})`, z: '#,##0.00' });
    put('D' + r, { t: 'n', v: t.expense, f: `SUM(D${firstData}:D${last})`, z: '#,##0.00' });
    put('E' + r, { t: 'n', v: t.balance, f: `E${last}`, z: '#,##0.00' });
    ws['!ref'] = `A1:E${r}`; ws['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'รายรับรายจ่าย');
    XLSX.writeFile(wb, `income-expense-${rows[0].date}_${rows[rows.length - 1].date}.xlsx`);
    toast('ส่งออกไฟล์แล้ว');
  }

  /* ---------- อื่น ๆ ---------- */
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2800); }
  const openSettings = () => switchTab('settings');
  function switchTab(v) {
    document.querySelector('.app').dataset.view = v;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === v));
  }

  function init() {
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('btn-gen').addEventListener('click', generateNow); $('btn-ai').addEventListener('click', askAi);
    $('btn-export').addEventListener('click', exportXlsx);
    let armed = 0;
    $('btn-clear').addEventListener('click', (e) => {
      if (!armed) { armed = setTimeout(() => { armed = 0; e.target.textContent = 'ล้างทั้งหมด'; e.target.classList.remove('danger'); }, 4000); e.target.textContent = 'กดอีกครั้งเพื่อยืนยัน'; e.target.classList.add('danger'); return; }
      clearTimeout(armed); armed = 0; e.target.textContent = 'ล้างทั้งหมด'; e.target.classList.remove('danger');
      state = defaults(); save(); renderSettings(); renderPlan(); renderTable(); toast('ล้างข้อมูลแล้ว');
    });
    window.IE.auth.init();
    window.IE.history.init({
      getState: () => state, toast, fmtDate: thDate,
      defaultName: () => `รายการ ${thDate(S().start)} – ${thDate(S().end)}`,
      setState: (s) => { state = normalize(s) || state; state.prevRows = null; save(); renderSettings(); renderPlan(); renderTable(); switchTab('ledger'); },
    });
    bindSettings(); bindPlan(); bindAdv(); bindTable(); renderSettings(); renderPlan(); renderTable(); switchTab(state.rows.length ? 'ledger' : 'settings');
  }
  init();
})();
