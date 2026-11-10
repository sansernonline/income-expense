const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./ledger.js');
const { FALLBACK_PLAN, sanitizePlan } = require('./plan.js');

const sum = (rows, k) => Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;
const base = { start: '2026-11-01', end: '2026-11-30', monthlyRevenue: { '2026-11': 90000 }, closedWeekdays: [1], closedDates: ['2026-11-15'] };

test('รายรับรวมเดือน = เป้าพอดี (FR-GEN-020)', () => {
  const rows = L.generate(base, FALLBACK_PLAN);
  assert.equal(sum(rows, 'income'), 90000);
});

test('รายจ่ายแต่ละหมวด = ร้อยละ × เป้า (FR-GEN-030)', () => {
  const rows = L.generate(base, FALLBACK_PLAN);
  for (const e of FALLBACK_PLAN.expenses) {
    const got = sum(rows.filter((r) => r.name === e.name), 'expense');
    assert.equal(got, Math.round(90000 * e.pct) / 100, e.name);
  }
});

test('วันหยุดไม่มีรายรับที่ระบบสร้าง (BR-030)', () => {
  const rows = L.generate(base, FALLBACK_PLAN);
  for (const r of rows.filter((r) => r.income > 0)) {
    assert.notEqual(L.weekday(r.date), 1);
    assert.notEqual(r.date, '2026-11-15');
  }
});

test('หลายเดือน: แต่ละเดือนตรงเป้าของตัวเอง', () => {
  const s = { ...base, start: '2026-10-20', end: '2026-12-10', monthlyRevenue: { '2026-10': 30000, '2026-11': 60000, '2026-12': 10000 }, closedWeekdays: [], closedDates: [] };
  const rows = L.generate(s, FALLBACK_PLAN);
  for (const [m, t] of Object.entries(s.monthlyRevenue)) assert.equal(sum(rows.filter((r) => r.date.startsWith(m)), 'income'), t);
});

test('ปิดทุกวัน หรือเป้า 0 → ไม่มีรายการ', () => {
  assert.equal(L.generate({ ...base, closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }, FALLBACK_PLAN).length, 0);
  assert.equal(L.generate({ ...base, monthlyRevenue: { '2026-11': 0 } }, FALLBACK_PLAN).length, 0);
});

test('จำนวนเงินที่สร้างเป็นผลคูณของ 10 ยกเว้นแถวรับเศษ (BR-040) และเรียงตามวันที่', () => {
  const rows = L.generate(base, FALLBACK_PLAN);
  assert.ok(rows.filter((r) => r.income % 10 === 0).length >= rows.filter((r) => r.income).length - 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].date <= rows[i].date);
});

test('คงเหลือต่อเนื่องจากยอดยกมา (FR-TBL-030)', () => {
  const rows = [{ income: 100, expense: 0 }, { income: 0, expense: 30 }, { income: 5.5, expense: 0 }];
  assert.deepEqual(L.balances(rows, 1000), [1100, 1070, 1075.5]);
  assert.deepEqual(L.totals(rows, 1000), { income: 105.5, expense: 30, balance: 1075.5, count: 3 });
});

test('toMoney: ติดลบ/ไม่ใช่ตัวเลข → 0 · ปัดทศนิยม 2 ตำแหน่ง (BR-020)', () => {
  assert.equal(L.toMoney('-5'), 0);
  assert.equal(L.toMoney('abc'), 0);
  assert.equal(L.toMoney('1,234.567'), 1234.57);
});

test('sanitizePlan: จำกัดจำนวนหมวด · ตัดแท็ก · ปฏิเสธแผนว่าง (BR-060)', () => {
  const raw = { revenue: [{ name: '<b>ขาย</b>', weight: 5 }], expenses: Array.from({ length: 6 }, (_, i) => ({ name: 'd' + i, pct: 3, freq: 'daily' })).concat([{ name: 'x', pct: 5, freq: 'yearly' }]) };
  const p = sanitizePlan(raw);
  assert.equal(p.expenses.length, 2);
  assert.ok(!p.revenue[0].name.includes('<'));
  assert.equal(sanitizePlan({ revenue: [], expenses: [] }), null);
  assert.equal(sanitizePlan('x'), null);
});

test('split รวมตรงเสมอ', () => {
  for (let i = 0; i < 200; i++) {
    const w = Array.from({ length: 1 + (i % 30) }, () => 0.5 + Math.random());
    const t = 1000 + i * 137;
    assert.equal(Math.round(L.split(t, w).reduce((a, b) => a + b, 0) * 100) / 100, t);
  }
});

const months = (rows) => [...new Set(rows.map((r) => r.date.slice(0, 7)))];
const incomeOf = (rows, m) => sum(rows.filter((r) => r.date.startsWith(m)), 'income');

test('โหมดเดือน: แต่ละเดือนสุ่มในช่วง และไม่ซ้ำกันทุกเดือน', () => {
  const s = { start: '2026-01-01', end: '2026-12-31', mode: 'month', monthMin: 80000, monthMax: 120000, closedWeekdays: [], closedDates: [] };
  const rows = L.generate(s, FALLBACK_PLAN);
  const totalsPerMonth = months(rows).map((m) => incomeOf(rows, m));
  assert.equal(totalsPerMonth.length, 12);
  for (const t of totalsPerMonth) assert.ok(t >= 80000 && t <= 120000, String(t));
  assert.ok(new Set(totalsPerMonth).size > 6, 'ควรต่างกันหลายเดือน');
});

test('โหมดเดือน: กำหนดเดือนเองชนะการสุ่ม · ช่วงใส่สลับก็ใช้ได้', () => {
  const s = { start: '2026-10-01', end: '2026-11-30', mode: 'month', monthMin: 120000, monthMax: 80000, monthlyRevenue: { '2026-10': 55500 }, closedWeekdays: [], closedDates: [] };
  const rows = L.generate(s, FALLBACK_PLAN);
  assert.equal(incomeOf(rows, '2026-10'), 55500);
  const nov = incomeOf(rows, '2026-11');
  assert.ok(nov >= 80000 && nov <= 120000);
});

test('โหมดวัน: รายรับแต่ละวันอยู่ในช่วง · ยอดเดือน = ผลรวมวัน · รายจ่ายตามยอดนั้น', () => {
  const s = { start: '2026-11-01', end: '2026-12-31', mode: 'day', dayMin: 2000, dayMax: 4000, closedWeekdays: [0], closedDates: [], monthMin: 1, monthMax: 1 };
  const rows = L.generate(s, FALLBACK_PLAN);
  const inc = rows.filter((r) => r.income > 0);
  for (const r of inc) { assert.ok(r.income >= 2000 && r.income <= 4000, String(r.income)); assert.notEqual(L.weekday(r.date), 0); }
  const rent = FALLBACK_PLAN.expenses.find((e) => e.name === 'ค่าเช่าที่');
  for (const m of months(rows)) {
    const rev = incomeOf(rows, m);
    assert.equal(sum(rows.filter((r) => r.date.startsWith(m) && r.name === rent.name), 'expense'), Math.round(rev * rent.pct) / 100);
  }
});

test('sanitizeSettings: ช่วงรายรับต่อเดือนจาก AI · ค่าเดียวใช้เป็นทั้ง min และ max', () => {
  const { sanitizeSettings } = require('./plan.js');
  assert.deepEqual(sanitizeSettings({ monthlyRevenueMin: 150000, monthlyRevenueMax: 100000 }), { monthMin: 100000, monthMax: 150000 });
  assert.deepEqual(sanitizeSettings({ monthlyRevenue: 90000 }), { monthMin: 90000, monthMax: 90000 });
  assert.deepEqual(sanitizeSettings({ monthlyRevenueMin: 'x' }), {});
});

const { PRESETS } = require('./presets.js');
const flat = { start: '2026-11-01', end: '2026-11-30', mode: 'month', monthMin: 100000, monthMax: 100000, closedWeekdays: [], closedDates: [] };

test('ประเภทธุรกิจสำเร็จรูป: ผ่าน sanitizePlan ไม่ถูกตัด · รายจ่ายรวมต่ำกว่า 100%', () => {
  assert.ok(PRESETS.length >= 8);
  for (const p of PRESETS) {
    assert.deepEqual(sanitizePlan({ revenue: p.revenue, expenses: p.expenses }), { revenue: p.revenue, expenses: p.expenses }, p.id);
    const pct = p.expenses.reduce((a, e) => a + e.pct, 0);
    assert.ok(pct > 20 && pct < 100, `${p.id} ${pct}`);
    assert.ok(p.income.monthMin < p.income.monthMax && p.income.dayMin < p.income.dayMax, p.id);
  }
});

test('กำไรเป้าหมาย: รายจ่ายรวม = (100 − กำไร)% ของรายรับ', () => {
  const rows = L.generate({ ...flat, margin: 40 }, FALLBACK_PLAN);
  assert.ok(Math.abs(sum(rows, 'expense') - 60000) <= 0.1 * FALLBACK_PLAN.expenses.length, String(sum(rows, 'expense')));
  assert.equal(sum(rows, 'income'), 100000);
});

test('รายรับที่คาดทั้งช่วง: ค่ากลางของช่วง × ขายดี/ซบเซา · เดือนที่กำหนดเองชนะ · โหมดรายวันคูณวันเปิด · ช่วงวันที่ผิดได้ 0', () => {
  const m = { start: '2026-01-01', end: '2026-03-31', monthMin: 80000, monthMax: 100000, season: { 1: 'peak', 3: 'slow' }, seasonPct: 30, monthlyRevenue: { '2026-02': 50000 } };
  assert.equal(L.expectedRevenue(m), 117000 + 50000 + 63000);
  const same = { ...flat, start: '2026-01-01', end: '2026-03-31', season: { 1: 'peak', 3: 'slow' }, seasonPct: 30 };
  assert.equal(L.expectedRevenue(same), sum(L.generate(same, FALLBACK_PLAN), 'income'), 'ช่วงแคบ = รายรับจริงที่สร้าง');
  assert.equal(L.expectedRevenue({ start: '2026-11-01', end: '2026-11-30', mode: 'day', dayMin: 2000, dayMax: 4000, closedWeekdays: [0] }), 25 * 3000);
  assert.equal(L.expectedRevenue({ start: '2026-03-02', end: '2026-03-01', monthMin: 1, monthMax: 1 }), 0);
});

test('ช่วงขายดี/ซบเซา: เดือนขายดีสูงกว่า ซบเซาต่ำกว่า (±30%)', () => {
  const s = { ...flat, start: '2026-01-01', end: '2026-03-31', season: { 1: 'peak', 3: 'slow' }, seasonPct: 30 };
  const rows = L.generate(s, FALLBACK_PLAN);
  assert.equal(incomeOf(rows, '2026-01'), 130000);
  assert.equal(incomeOf(rows, '2026-02'), 100000);
  assert.equal(incomeOf(rows, '2026-03'), 70000);
});

test('รายการรายรับต่อวัน: txMin-txMax · ยอดวันยังรวมตรง', () => {
  const rows = L.generate({ ...flat, txMin: 3, txMax: 3 }, FALLBACK_PLAN);
  const inc = rows.filter((r) => r.income > 0);
  assert.equal(sum(inc, 'income'), 100000);
  assert.ok(inc.length >= 80, String(inc.length));
  assert.ok(inc.every((r) => r.income > 0));
});

test('ล็อกผลสุ่มด้วย seed: ผลเหมือนเดิม · seed ต่างผลต่าง · ไม่ใส่ seed ผลไม่ซ้ำ', () => {
  const a = L.generate({ ...flat, seed: 'abc' }, FALLBACK_PLAN), b = L.generate({ ...flat, seed: 'abc' }, FALLBACK_PLAN);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, L.generate({ ...flat, seed: 'abd' }, FALLBACK_PLAN));
  assert.notDeepEqual(L.generate(flat, FALLBACK_PLAN), L.generate(flat, FALLBACK_PLAN));
});

test('ส.-อา. ขายดีกว่า · ความผันผวน 0 = วันธรรมดาเท่ากัน', () => {
  const rows = L.generate({ ...flat, weekendPct: 100, jitterPct: 0, txMin: 1, txMax: 1 }, FALLBACK_PLAN).filter((r) => r.income > 0);
  const wk = rows.find((r) => L.weekday(r.date) === 3).income, we = rows.find((r) => L.weekday(r.date) === 6).income;
  assert.ok(Math.abs(we / wk - 2) < 0.05, `${we}/${wk}`);
});

test('% รายจ่าย 0 ใช้ได้จริง (ไม่ถูกปรับเป็น 0.1) · หมวดมาตรฐานกลางรวม 65–90%', () => {
  const p = sanitizePlan({ revenue: [{ name: 'a', weight: 1 }], expenses: [{ name: 'x', pct: 0, freq: 'daily' }, { name: 'y', pct: 70, freq: 'daily' }] });
  assert.equal(p.expenses[0].pct, 0);
  assert.equal(p.expenses[1].pct, 60); // เพดาน 60
  const rows = L.generate(base, { revenue: [{ name: 'a', weight: 1 }], expenses: [{ name: 'x', pct: 0, freq: 'monthly', day: 1 }] });
  assert.equal(sum(rows, 'expense'), 0);
  const total = FALLBACK_PLAN.expenses.reduce((a, e) => a + e.pct, 0);
  assert.ok(total >= 65 && total <= 90, String(total));
});

test('ลากย้ายแถว: วันที่ตามแถวบนที่วางแทรก · วางบนสุดใช้วันของแถวล่าง · แถวเดิมไม่ถูกแก้', () => {
  const rows = [{ id: 1, date: '2026-03-01' }, { id: 2, date: '2026-03-02' }, { id: 3, date: '2026-03-05' }, { id: 4, date: '2026-03-09' }];
  const down = L.moveRow(rows, 0, 2); // id 1 ไปอยู่ใต้ id 3
  assert.deepEqual(down.map((r) => [r.id, r.date]), [[2, '2026-03-02'], [3, '2026-03-05'], [1, '2026-03-05'], [4, '2026-03-09']]);
  const top = L.moveRow(rows, 3, 0); // id 4 ขึ้นบนสุด
  assert.deepEqual(top.map((r) => [r.id, r.date]), [[4, '2026-03-01'], [1, '2026-03-01'], [2, '2026-03-02'], [3, '2026-03-05']]);
  assert.deepEqual(L.sortRows(down).map((r) => r.id), down.map((r) => r.id), 'ยังเรียงตามวันที่');
  assert.equal(rows[0].date, '2026-03-01');
});
