/* แผน (หมวดรายรับ/รายจ่าย) และค่าตั้งค่าที่ AI ส่งมา — BR-060 · FR-BIZ-010/020/050 · NFR-SEC-020 · D-04 D-05 D-06 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { FALLBACK_PLAN, sanitizePlan, sanitizeSettings, LIMITS } = require('./plan.js');
const { PRESETS } = require('./presets.js');
const L = require('./ledger.js');

const rev = [{ name: 'ขาย', weight: 1 }];
const one = (e) => sanitizePlan({ revenue: rev, expenses: [{ name: 'x', freq: 'monthly', ...e }] }).expenses[0];

test('BR_060: เพดานชื่อหมวด 40 ตัวอักษร (39 · 40 ผ่าน · 41 และ 500 ถูกตัดเหลือ 40) · TC-BIZ-016 · TC-SEC-010', () => {
  assert.equal(LIMITS.name, 40);
  for (const [n, want] of [[39, 39], [40, 40], [41, 40], [500, 40]]) {
    assert.equal(sanitizePlan({ revenue: [{ name: 'ก'.repeat(n), weight: 1 }], expenses: [{ name: 'ข'.repeat(n), pct: 5, freq: 'daily' }] }).revenue[0].name.length, want, String(n));
  }
});

test('FR_BIZ_020 · D-04 D-06 · TC-BIZ-017: % รายจ่าย −1 → 0 · 0 ใช้ได้จริง · 60 · 61 → 60', () => {
  assert.deepEqual([-1, 0, 60, 61].map((pct) => one({ pct }).pct), [0, 0, 60, 60]);
});

test('FR_BIZ_020 · D-06 · TC-BIZ-018 · TC-SEC-012: วันที่จ่ายรายเดือน 0 · 1 · 28 · 29 · 31 · 32 ปรับเป็นขอบ 1–28 (ไม่เกิดวันที่นอกเดือน)', () => {
  assert.deepEqual([0, 1, 28, 29, 31, 32].map((day) => one({ pct: 5, day }).day), [1, 1, 28, 28, 28, 28]);
});

test('NFR_SEC_020 · TC-SEC-011: % ผิดชนิด (ข้อความ "สิบ" · null · NaN · −10 · 1000) ไม่ทำให้เกิด NaN หรือยอดติดลบ', () => {
  for (const pct of ['สิบ', null, NaN, undefined, {}, -10, 1000, '12abc']) {
    const e = one({ pct });
    assert.ok(Number.isFinite(e.pct) && e.pct >= 0 && e.pct <= 60, String(pct));
  }
  const p = sanitizePlan({ revenue: [{ name: 'a', weight: 'x' }, { name: 'b', weight: -5 }, { name: 'c', weight: 1e9 }], expenses: [{ name: 'e', pct: 5, freq: 'daily' }] });
  assert.ok(p.revenue.every((r) => r.weight >= 1 && r.weight <= 100));
});

test('NFR_SEC_020 · TC-SEC-013: รูปร่างผิด ({} [] null "text" ตัวเลข วงกลม) → null ไม่โยน error', () => {
  for (const bad of [{}, [], null, 'text', 5, { incomeCategories: 5 }, { revenue: 'x', expenses: 'y' }, { revenue: [null], expenses: [null] }, { revenue: [], expenses: [] }]) assert.equal(sanitizePlan(bad), null);
});

test('NFR_SEC_020 · TC-SEC-014/020: ชื่อหมวดที่เป็น HTML ถูกตัด < > และอักขระควบคุม ก่อนเข้าแอป', () => {
  const p = sanitizePlan({ revenue: [{ name: '<img src=x onerror="window.__x=1">', weight: 1 }], expenses: [{ name: '<script>alert(1)</script>\u0000x', pct: 5, freq: 'daily' }] });
  assert.ok(!/[<>\u0000]/.test(p.revenue[0].name + p.expenses[0].name));
});

test('BR_060 · FR_BIZ_020: หมวดที่ชื่อว่างหรือเว้นวรรคล้วนถูกตัดออก · ต้องเหลืออย่างน้อย 1 รายรับกับ 1 รายจ่าย (TC-BIZ-019/020)', () => {
  const p = sanitizePlan({ revenue: [{ name: '   ', weight: 1 }, { name: 'ขาย', weight: 1 }], expenses: [{ name: '', pct: 5, freq: 'daily' }, { name: 'ค่า', pct: 5, freq: 'daily' }] });
  assert.equal(p.revenue.length, 1);
  assert.equal(p.expenses.length, 1);
  assert.equal(sanitizePlan({ revenue: [{ name: ' ', weight: 1 }], expenses: [{ name: 'ค่า', pct: 5, freq: 'daily' }] }), null);
  assert.equal(sanitizePlan({ revenue: rev, expenses: [{ name: ' ', pct: 5, freq: 'daily' }] }), null);
});

test('D-05 · FR_BIZ_010 · TC-GEN-030/BIZ-005: หมวดมาตรฐานกลางรวมรายจ่าย 65% ผ่านเพดานทุกข้อ', () => {
  assert.equal(FALLBACK_PLAN.expenses.reduce((a, e) => a + e.pct, 0), 65);
  assert.deepEqual(sanitizePlan(FALLBACK_PLAN), FALLBACK_PLAN);
});

test('FR_BIZ_010 · BR_060 · TC-BIZ-003: ทุกประเภทสำเร็จรูป 8 ประเภท ผ่านเพดานและช่วงตัวเลข และสร้างรายการได้ รายรับอยู่ในช่วงของประเภท', () => {
  assert.equal(PRESETS.length, 8);
  assert.deepEqual(PRESETS.map((p) => p.label), ['ร้านกาแฟ', 'ร้านอาหารตามสั่ง', 'ขายของออนไลน์', 'อู่ซ่อมรถ', 'หอพักให้เช่า', 'ฟรีแลนซ์ออกแบบ', 'ร้านขายของชำ', 'ร้านเสริมสวย']);
  for (const p of PRESETS) {
    assert.ok(p.revenue.length >= 1 && p.revenue.length <= 5, p.id);
    const by = (f) => p.expenses.filter((e) => e.freq === f);
    assert.ok(by('daily').length <= 2 && by('weekly').length <= 3 && by('monthly').length <= 8 && p.expenses.length >= 1, p.id);
    for (const e of p.expenses) assert.ok(e.name.length >= 1 && e.name.length <= 40 && e.pct >= 0 && e.pct <= 60 && (e.freq !== 'monthly' || (e.day >= 1 && e.day <= 28)), `${p.id} ${e.name}`);
    for (const r of p.revenue) assert.ok(r.weight > 0 && r.name.length <= 40);
    assert.ok(p.income.monthMin >= 0 && p.income.monthMin <= p.income.monthMax && p.income.dayMin >= 0 && p.income.dayMin <= p.income.dayMax, p.id);
    assert.deepEqual(sanitizePlan({ revenue: p.revenue, expenses: p.expenses }), { revenue: p.revenue, expenses: p.expenses }, p.id);
    const rows = L.generate({ start: '2026-03-01', end: '2026-03-31', mode: 'month', ...p.income, closedWeekdays: [0], closedDates: [], txMin: 1, txMax: 1 }, p);
    assert.ok(rows.length > 0 && rows.every((r) => Number.isFinite(r.income) && Number.isFinite(r.expense)), p.id);
    const total = rows.reduce((a, r) => a + r.income, 0);
    assert.ok(total >= p.income.monthMin && total <= p.income.monthMax, `${p.id} ${total}`);
  }
});

test('FR_BIZ_050 · TC-BIZ-037: AI ส่งค่าเดียวพร้อมช่วงวันที่ → ตั้งแต่ = ถึง = ค่านั้น และได้วันที่', () => {
  assert.deepEqual(sanitizeSettings({ monthlyRevenue: 120000, startDate: '2026-03-01', endDate: '2026-05-31' }), { monthMin: 120000, monthMax: 120000, startDate: '2026-03-01', endDate: '2026-05-31' });
});

test('FR_BIZ_050 · TC-BIZ-038/039: AI ส่งช่วงรายรับ · ส่งสลับกัน ระบบสลับให้', () => {
  assert.deepEqual(sanitizeSettings({ monthlyRevenueMin: 100000, monthlyRevenueMax: 150000 }), { monthMin: 100000, monthMax: 150000 });
  assert.deepEqual(sanitizeSettings({ monthlyRevenueMin: 150000, monthlyRevenueMax: 100000 }), { monthMin: 100000, monthMax: 150000 });
});

test('FR_BIZ_050 · TC-BIZ-040/041/042: ส่งเฉพาะรายรับ → ไม่มีวันที่ · ส่งเฉพาะวันที่ → ไม่มีรายรับ · ไม่ส่ง/null → ว่าง', () => {
  assert.deepEqual(sanitizeSettings({ monthlyRevenue: 50000 }), { monthMin: 50000, monthMax: 50000 });
  assert.deepEqual(sanitizeSettings({ startDate: '2026-03-01', endDate: '2026-05-31' }), { startDate: '2026-03-01', endDate: '2026-05-31' });
  for (const none of [undefined, null, {}, 'x', 5, { monthlyRevenueMin: null, monthlyRevenueMax: null, startDate: null, endDate: null }]) assert.deepEqual(sanitizeSettings(none), {});
});

test('FR_BIZ_050 · TC-BIZ-043: ค่าผิดกฎ (รายรับ −1 · 0 · ช่วง 400 วัน · เริ่ม > สิ้นสุด · วันที่ไม่มีจริง) ไม่ถูกเติม', () => {
  assert.deepEqual(sanitizeSettings({ monthlyRevenue: -1 }), {});
  assert.deepEqual(sanitizeSettings({ monthlyRevenue: 0 }), {});
  assert.deepEqual(sanitizeSettings({ startDate: '2026-01-01', endDate: '2027-02-04' }), {}, '400 วัน');
  assert.deepEqual(sanitizeSettings({ startDate: '2026-03-31', endDate: '2026-03-01' }), {});
  assert.deepEqual(sanitizeSettings({ startDate: '2026-02-30', endDate: '2026-03-01' }), {});
  assert.deepEqual(sanitizeSettings({ startDate: '2026-01-01', endDate: '2027-01-01' }), { startDate: '2026-01-01', endDate: '2027-01-01' }, '366 วันพอดีผ่าน');
});
