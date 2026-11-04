/* ตัวสร้างรายการ (FR-GEN-* · FR-SET-030/090/100-150 · BR-010/020/030/040/050) — ผลคาดหวังคิดมือจากข้อกำหนดและค่า SETUP ของ test case */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./ledger.js');
const { sanitizePlan } = require('./plan.js');

const r2 = (n) => Math.round(n * 100) / 100;
const sum = (rows) => r2(rows.reduce((a, r) => a + r.income + r.expense, 0));
const inc = (rows) => rows.filter((r) => r.income > 0);
const month = (rows, m) => rows.filter((r) => r.date.startsWith(m));
const incomeOf = (rows, m) => r2(inc(month(rows, m)).reduce((a, r) => a + r.income, 0));
const cat = (rows, name, m = '') => sum(rows.filter((r) => r.name === name && r.date.startsWith(m)));
const perDay = (rows) => { const o = {}; for (const r of inc(rows)) o[r.date] = r2((o[r.date] || 0) + r.income); return o; };
const wd = (iso) => L.weekday(iso);

/** แผน A: รายรับ 60/40 · รายจ่าย 70% = วัตถุดิบ 30 (วัน) + ค่าขนส่ง 5 (สัปดาห์) + ค่าเช่า 20 (วันที่ 5) + ค่าไฟ 5 (วันที่ 25) + ค่าแรง 10 (วันที่ 28) */
const planA = {
  revenue: [{ name: 'ขายหน้าร้าน', weight: 60 }, { name: 'เดลิเวอรี', weight: 40 }],
  expenses: [
    { name: 'วัตถุดิบ', pct: 30, freq: 'daily' }, { name: 'ค่าขนส่ง', pct: 5, freq: 'weekly' },
    { name: 'ค่าเช่า', pct: 20, freq: 'monthly', day: 5 }, { name: 'ค่าไฟ', pct: 5, freq: 'monthly', day: 25 }, { name: 'ค่าแรง', pct: 10, freq: 'monthly', day: 28 },
  ],
};
const planB = { revenue: [{ name: 'ขายหน้าร้าน', weight: 1 }], expenses: [{ name: 'ค่าของ', pct: 45, freq: 'weekly' }, { name: 'ค่าแรง', pct: 45, freq: 'monthly', day: 28 }] };
const SETUP = { start: '2026-03-01', end: '2026-03-31', mode: 'month', monthMin: 90000, monthMax: 90000, closedWeekdays: [0], closedDates: [], txMin: 1, txMax: 1, seed: 's1' };
const gen = (over = {}, plan = planA) => L.generate({ ...SETUP, ...over }, plan);
const CATS = ['วัตถุดิบ', 'ค่าขนส่ง', 'ค่าเช่า', 'ค่าไฟ', 'ค่าแรง'];

test('FR_GEN_010 · BR_030 · TC-GEN-001: วันหยุดประจำสัปดาห์ (อาทิตย์ 1 8 15 22 29 มี.ค. 2026) ไม่มีรายการ · วันเปิด 26 วัน', () => {
  const rows = gen();
  for (const d of ['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29']) assert.equal(rows.filter((r) => r.date === d).length, 0, d);
  assert.equal(new Set(inc(rows).map((r) => r.date)).size, 26);
});

test('BR_030 · TC-GEN-002: วันหยุดพิเศษ + ประจำสัปดาห์รวม 6 วัน → รายรับ 25 วัน', () => {
  const rows = gen({ closedDates: ['2026-03-10'] });
  assert.equal(rows.filter((r) => r.date === '2026-03-10').length, 0);
  assert.equal(new Set(inc(rows).map((r) => r.date)).size, 25);
});

test('FR_GEN_010 · TC-GEN-003: รายจ่ายรายวัน 1 แถวต่อวันเปิด · รายสัปดาห์ไม่เกิน 1 แถวต่อสัปดาห์ในวันเปิด · รายเดือนหมวดละ 1 แถว', () => {
  const rows = gen();
  assert.equal(rows.filter((r) => r.name === 'วัตถุดิบ').length, 26);
  const weekly = rows.filter((r) => r.name === 'ค่าขนส่ง');
  assert.ok(weekly.length >= 1 && weekly.every((r) => wd(r.date) !== 0));
  const weekOf = (iso) => Math.floor((Date.parse(iso) / 864e5 + 3) / 7); // สัปดาห์จันทร์-อาทิตย์
  assert.equal(new Set(weekly.map((r) => weekOf(r.date))).size, weekly.length, 'ไม่มี 2 แถวในสัปดาห์เดียวกัน');
  for (const n of ['ค่าเช่า', 'ค่าไฟ', 'ค่าแรง']) assert.equal(rows.filter((r) => r.name === n).length, 1, n);
});

test('FR_GEN_010 · TC-GEN-004: รายจ่ายรายเดือนลงวันที่ตามแผน (ค่าเช่า 5 มี.ค. 18,000 · ค่าไฟ 25 มี.ค. 4,500)', () => {
  const rows = gen();
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าเช่า').map((r) => [r.date, r.expense]), [['2026-03-05', 18000]]);
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าไฟ').map((r) => [r.date, r.expense]), [['2026-03-25', 4500]]);
});

test('BR_030 · D-01 · TC-GEN-005: รายจ่ายรายเดือนที่ตรงวันหยุด (ค่าแรง 28 มี.ค. = เสาร์) คงวันที่ ไม่เลื่อน · วันหยุดไม่มีรายรับ/รายวัน/รายสัปดาห์', () => {
  const rows = gen({ closedWeekdays: [0, 6] });
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าแรง').map((r) => [r.date, r.expense]), [['2026-03-28', 9000]]);
  assert.equal(rows.filter((r) => r.date === '2026-03-28').length, 1, 'วันหยุดมีเฉพาะรายเดือน');
  assert.ok(rows.every((r) => wd(r.date) !== 6 || r.name === 'ค่าแรง'));
});

test('FR_GEN_020 · TC-GEN-006: รายรับ 1 เดือนรวม 90,000.00 พอดี', () => assert.equal(incomeOf(gen(), '2026-03'), 90000));

test('FR_GEN_020 · FR_GEN_030 · TC-GEN-007/038: หลายเดือนกำหนดเอง มี.ค. 90,000 · เม.ย. 120,000 · พ.ค. 60,000 · ค่าเช่า 20% ตามเดือน', () => {
  const rows = gen({ end: '2026-05-31', monthlyRevenue: { '2026-03': 90000, '2026-04': 120000, '2026-05': 60000 } });
  assert.deepEqual(['2026-03', '2026-04', '2026-05'].map((m) => incomeOf(rows, m)), [90000, 120000, 60000]);
  assert.deepEqual(['2026-03', '2026-04', '2026-05'].map((m) => cat(rows, 'ค่าเช่า', m)), [18000, 24000, 12000]);
});

test('FR_GEN_020 · TC-GEN-008: เริ่มกลางเดือน (20 มี.ค.–10 เม.ย.) เดือนที่ไม่เต็มยังรวมเท่าเป้า', () => {
  const rows = gen({ start: '2026-03-20', end: '2026-04-10' });
  assert.equal(incomeOf(rows, '2026-03'), 90000);
  assert.equal(incomeOf(rows, '2026-04'), 90000);
});

test('FR_GEN_020 · TC-GEN-009: เดือนที่มีวันเปิดวันเดียว รายรับทั้งเดือนลงวันนั้น', () => {
  const mondays = ['2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'];
  const rows = gen({ closedWeekdays: [0, 2, 3, 4, 5, 6], closedDates: mondays });
  assert.deepEqual(perDay(rows), { '2026-03-02': 90000 });
});

test('BR_030 · FR_GEN_060 · TC-GEN-010: ทุกวันเป็นวันหยุด → ไม่มีรายการและไม่ error', () => {
  assert.deepEqual(gen({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }), []);
});

test('FR_GEN_030 · TC-GEN-011: รายจ่ายต่อหมวดต่อเดือน = % × เป้า (27,000 · 4,500 · 18,000 · 4,500 · 9,000 รวม 63,000)', () => {
  const rows = gen();
  assert.deepEqual(CATS.map((n) => cat(rows, n)), [27000, 4500, 18000, 4500, 9000]);
  assert.equal(r2(rows.reduce((a, r) => a + r.expense, 0)), 63000);
});

test('BR_040 · FR_GEN_020 · TC-GEN-012: เป้า 90,005 → รายรับตรง 90,005.00 · วัตถุดิบ 27,001.50 · แถวก่อนท้ายเป็นผลคูณ 10 แถวท้ายรับเศษ', () => {
  const rows = gen({ monthlyRevenue: { '2026-03': 90005 } });
  assert.equal(incomeOf(rows, '2026-03'), 90005);
  const raw = rows.filter((r) => r.name === 'วัตถุดิบ');
  assert.equal(cat(rows, 'วัตถุดิบ'), 27001.5);
  assert.ok(raw.slice(0, -1).every((r) => r.expense % 10 === 0));
});

test('BR_020 · BR_010 · TC-GEN-013: ทุกจำนวนที่สร้าง ≥ 0 ทศนิยม ≤ 2 ตำแหน่ง และแต่ละแถวมีรายรับหรือรายจ่ายอย่างใดอย่างหนึ่ง', () => {
  for (const r of gen({ monthlyRevenue: { '2026-03': 12345.67 }, seed: '' })) {
    assert.ok(r.income >= 0 && r.expense >= 0);
    assert.equal(r2(r.income), r.income);
    assert.equal(r2(r.expense), r.expense);
    assert.ok((r.income > 0) !== (r.expense > 0), JSON.stringify(r));
  }
});

test('BR_040 · TC-GEN-014: เป้ากลม 90,000 → ทุกจำนวนที่สร้างหาร 10 ลงตัว', () => {
  for (const r of gen()) assert.equal((r.income + r.expense) % 10, 0, JSON.stringify(r));
});

test('BR_050 · TC-GEN-015: ส.–อา. ≈ ×1.3 และศุกร์ ≈ ×1.15 ของจันทร์–พฤหัส (เฉลี่ยหลายชุด ±0.10)', () => {
  let we = 0, fr = 0;
  const K = 5;
  for (let k = 0; k < K; k++) {
    const d = perDay(gen({ start: '2026-01-01', end: '2026-12-31', closedWeekdays: [], seed: 'w' + k }));
    const avg = (f) => { const v = Object.entries(d).filter(([iso]) => f(wd(iso))).map((e) => e[1]); return v.reduce((a, b) => a + b, 0) / v.length; };
    const base = avg((w) => w >= 1 && w <= 4);
    we += avg((w) => w === 0 || w === 6) / base / K;
    fr += avg((w) => w === 5) / base / K;
  }
  assert.ok(we > 1.2 && we < 1.4, 'สุดสัปดาห์ ' + we);
  assert.ok(fr > 1.05 && fr < 1.25, 'ศุกร์ ' + fr);
});

test('BR_050 · TC-GEN-016: ยอดวันแกว่งไม่เกิน ±25% จากน้ำหนัก (r ใน 0.70–1.30) และแกว่งจริงอย่างน้อย 1 วัน', () => {
  const d = perDay(gen());
  const w = (iso) => (wd(iso) === 6 ? 1.3 : wd(iso) === 5 ? 1.15 : 1);
  const days = Object.keys(d), W = days.reduce((a, x) => a + w(x), 0);
  const rs = days.map((x) => d[x] / ((90000 * w(x)) / W));
  assert.ok(rs.every((r) => r > 0.7 && r < 1.3), rs.map((x) => x.toFixed(2)).join(' '));
  assert.ok(rs.some((r) => Math.abs(r - 1) > 0.1));
});

test('FR_GEN_040 · TC-GEN-017/018: สุ่มใหม่ (ไม่มี seed) จำนวนต่างจากเดิม แต่ยอดรวมรายรับและรายหมวดเท่าเดิมทุกครั้ง', () => {
  const first = gen({ seed: '' });
  for (let i = 0; i < 10; i++) {
    const again = gen({ seed: '' });
    assert.equal(incomeOf(again, '2026-03'), 90000);
    assert.deepEqual(CATS.map((n) => cat(again, n)), [27000, 4500, 18000, 4500, 9000]);
    if (i === 0) assert.notDeepEqual(inc(first).map((r) => r.income), inc(again).map((r) => r.income));
  }
});

test('FR_GEN_020 · TC-GEN-031/040: 12 เดือนช่วง 80,000–100,000 สุ่มต่อเดือน อยู่ในช่วงและหาร 100 ลงตัว ต่างกันอย่างน้อย 2 ค่า', () => {
  const rows = gen({ start: '2026-01-01', end: '2026-12-31', monthMin: 80000, monthMax: 100000, seed: '' });
  const t = Array.from({ length: 12 }, (_, i) => incomeOf(rows, '2026-' + String(i + 1).padStart(2, '0')));
  for (const v of t) assert.ok(v >= 80000 && v <= 100000 && v % 100 === 0, String(v));
  assert.ok(new Set(t).size >= 2);
});

test('FR_SET_030 · FR_GEN_020 · TC-SET-024: ช่วง 80,050–80,250 → เป้าเป็น 80,100 หรือ 80,200 เท่านั้น (ผลคูณ 100 ที่อยู่ในช่วง)', () => {
  const rows = gen({ start: '2026-01-01', end: '2026-12-31', monthMin: 80050, monthMax: 80250, seed: '' });
  for (let m = 1; m <= 12; m++) assert.ok([80100, 80200].includes(incomeOf(rows, '2026-' + String(m).padStart(2, '0'))), String(m));
});

test('FR_SET_030 · TC-SET-025: ช่วงแคบจนไม่มีผลคูณ 100 (50–60) → เป้ายังอยู่ในช่วง ไม่ NaN', () => {
  const rows = gen({ monthMin: 50, monthMax: 60, seed: '' });
  const v = incomeOf(rows, '2026-03');
  assert.ok(v >= 50 && v <= 60, String(v));
  assert.ok(rows.every((r) => Number.isFinite(r.income) && Number.isFinite(r.expense)));
});

test('FR_SET_030 · TC-SET-019/020/021/022: ตั้งแต่=ถึง ได้เป้านั้น · สลับให้ · 0–0 ไม่มีรายการ · ติดลบเป็น 0', () => {
  assert.equal(incomeOf(gen({ monthMin: 70000, monthMax: 70000 }), '2026-03'), 70000);
  const swapped = incomeOf(gen({ monthMin: 100000, monthMax: 80000, seed: '' }), '2026-03');
  assert.ok(swapped >= 80000 && swapped <= 100000);
  assert.deepEqual(gen({ monthMin: 0, monthMax: 0 }), []);
  assert.deepEqual(gen({ monthMin: -1, monthMax: 0 }), []);
  assert.equal(incomeOf(gen({ monthMin: 1, monthMax: 1 }), '2026-03'), 1);
});

test('FR_SET_090 · D-10 · TC-SET-026/027/028: เป้ากำหนดเองชนะการสุ่ม (นอกช่วงได้) · 0 = สุ่มตามปกติ · 1 และทศนิยม 2 ตำแหน่งรวมตรง', () => {
  const s = { end: '2026-05-31', monthMin: 80000, monthMax: 100000, seed: '' };
  const rows = gen({ ...s, monthlyRevenue: { '2026-03': 120000 } });
  assert.equal(incomeOf(rows, '2026-03'), 120000);
  for (const m of ['2026-04', '2026-05']) { const v = incomeOf(rows, m); assert.ok(v >= 80000 && v <= 100000 && v % 100 === 0); }
  const zero = incomeOf(gen({ ...s, monthlyRevenue: { '2026-03': 0 } }), '2026-03');
  assert.ok(zero >= 80000 && zero <= 100000, 'D-10: 0 = สุ่ม ไม่ใช่เดือนว่าง');
  assert.equal(incomeOf(gen({ ...s, monthlyRevenue: { '2026-03': 1 } }), '2026-03'), 1);
  assert.equal(incomeOf(gen({ ...s, monthlyRevenue: { '2026-03': 54321.99 } }), '2026-03'), 54321.99);
});

test('FR_GEN_020 · TC-GEN-032: เดือนที่ไม่มีวันเปิดเลย (เม.ย. ปิดทุกวัน) ไม่มีรายการ ส่วน มี.ค. ยังตรง 90,000', () => {
  const closed = Array.from({ length: 30 }, (_, i) => `2026-04-${String(i + 1).padStart(2, '0')}`);
  const rows = gen({ end: '2026-04-30', closedDates: closed });
  assert.equal(month(rows, '2026-04').length, 0);
  assert.equal(incomeOf(rows, '2026-03'), 90000);
});

const DAY = { mode: 'day', dayMin: 2000, dayMax: 3000, seed: '' };
test('FR_SET_080 · FR_GEN_020 · TC-GEN-033: โหมดรายวัน แต่ละวันเปิด 2,000–3,000 หาร 10 ลงตัว ยอดเดือน = ผลรวมของวัน (52,000–78,000)', () => {
  const rows = gen(DAY);
  const d = perDay(rows);
  assert.equal(Object.keys(d).length, 26);
  for (const v of Object.values(d)) assert.ok(v >= 2000 && v <= 3000 && v % 10 === 0, String(v));
  const t = incomeOf(rows, '2026-03');
  assert.ok(t >= 52000 && t <= 78000);
  assert.equal(t, r2(Object.values(d).reduce((a, b) => a + b, 0)));
});

test('FR_SET_080 · TC-GEN-034/035: ตั้งแต่=ถึง 2,500 → ทุกวันเปิด 2,500 รวม 65,000 · รายจ่ายหมวด = % × 65,000 รวม 45,500', () => {
  const rows = gen({ ...DAY, dayMin: 2500, dayMax: 2500 });
  assert.ok(Object.values(perDay(rows)).every((v) => v === 2500));
  assert.equal(incomeOf(rows, '2026-03'), 65000);
  assert.deepEqual(CATS.map((n) => cat(rows, n)), [19500, 3250, 13000, 3250, 6500]);
});

test('FR_SET_080 · TC-GEN-036: โหมดรายวัน ทุกวันหยุด หรือช่วง 0–0 → ไม่มีรายรับ ไม่ NaN', () => {
  assert.deepEqual(gen({ ...DAY, closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }), []);
  assert.equal(sum(gen({ ...DAY, dayMin: 0, dayMax: 0 })), 0);
});

test('BR_050 · TC-GEN-037: โหมดรายวันไม่ใช้น้ำหนักสุดสัปดาห์/ศุกร์ (เฉลี่ย 1.00 ± 0.10)', () => {
  const d = perDay(gen({ ...DAY, start: '2026-01-01', end: '2026-12-31', closedWeekdays: [], dayMin: 1000, dayMax: 5000, seed: 'x' }));
  const avg = (f) => { const v = Object.entries(d).filter(([i]) => f(wd(i))).map((e) => e[1]); return v.reduce((a, b) => a + b, 0) / v.length; };
  const base = avg((w) => w >= 1 && w <= 4);
  assert.ok(Math.abs(avg((w) => w === 0 || w === 6) / base - 1) < 0.1);
  assert.ok(Math.abs(avg((w) => w === 5) / base - 1) < 0.1);
});

test('FR_SET_080 · TC-GEN-041: โหมดรายวันหลายเดือน ยอดแต่ละเดือน = 2,500 × จำนวนวันเปิดของเดือน (มี.ค. 26 วัน · เม.ย. 26 วัน)', () => {
  const rows = gen({ ...DAY, dayMin: 2500, dayMax: 2500, end: '2026-04-30' });
  assert.equal(incomeOf(rows, '2026-03'), 65000);
  assert.equal(incomeOf(rows, '2026-04'), 65000);
});

const PLAN_B = { monthMin: 100000, monthMax: 100000, closedWeekdays: [0], closedDates: [] };
test('FR_SET_100 · TC-GEN-047 · TC-SET-045: กำไรเป้าหมาย 30% รายรับ 100,000 → รายจ่ายรวม 70,000 (ค่าของ 35,000 + ค่าแรง 35,000) · ว่าง = 45,000 เท่าเดิม', () => {
  const none = gen(PLAN_B, planB);
  assert.deepEqual([cat(none, 'ค่าของ'), cat(none, 'ค่าแรง')], [45000, 45000]);
  const m = gen({ ...PLAN_B, margin: 30 }, planB);
  assert.deepEqual([cat(m, 'ค่าของ'), cat(m, 'ค่าแรง')], [35000, 35000]);
  assert.equal(r2(m.reduce((a, r) => a + r.expense, 0)), 70000);
});

test('FR_SET_100 · TC-SET-046/047/049: กำไร 0 → รายจ่ายรวม 100% · −1 เป็น 0 · 95 → 5% · 96 เป็น 95 · % ทุกหมวด 0 → รายจ่าย 0 ไม่ NaN', () => {
  const exp = (margin) => r2(gen({ ...PLAN_B, margin }, planB).reduce((a, r) => a + r.expense, 0));
  assert.equal(exp(0), 100000);
  assert.equal(exp(-1), 100000);
  assert.equal(exp(95), 5000);
  assert.equal(exp(96), 5000);
  const zero = { revenue: planB.revenue, expenses: [{ name: 'ค่าของ', pct: 0, freq: 'weekly' }] };
  const z = gen({ ...PLAN_B, margin: 30 }, zero);
  assert.ok(z.every((r) => Number.isFinite(r.expense)));
  assert.equal(sum(z.filter((r) => r.expense)), 0);
});

test('FR_SET_100 · TC-SET-050: กำไรเป้าหมายใช้ในโหมดรายวันด้วย (รายรับ 65,000 กำไร 30% → รายจ่าย 45,500)', () => {
  const rows = gen({ ...DAY, dayMin: 2500, dayMax: 2500, margin: 30 });
  assert.equal(r2(rows.reduce((a, r) => a + r.expense, 0)), 45500);
});

test('FR_SET_110 · BR_050 · TC-SET-051/052: สุดสัปดาห์ +30% ตั้งต้น · 100% ได้ ×2 · 0% เท่าวันธรรมดา · 101 เป็น 100 · −1 เป็น 0', () => {
  const ratio = (weekendPct) => {
    const d = perDay(gen({ weekendPct, jitterPct: 0, start: '2026-01-01', end: '2026-01-31', closedWeekdays: [] }));
    return d['2026-01-03'] / d['2026-01-05']; // เสาร์ ÷ จันทร์
  };
  assert.ok(Math.abs(ratio(30) - 1.3) < 0.02);
  assert.ok(Math.abs(ratio(100) - 2) < 0.02);
  assert.ok(Math.abs(ratio(0) - 1) < 0.02);
  assert.ok(Math.abs(ratio(101) - 2) < 0.02);
  assert.ok(Math.abs(ratio(-1) - 1) < 0.02);
});

test('FR_SET_120 · TC-SET-054/055: เดือนขายดีคูณ 1.25 ซบเซาคูณ 0.75 → 125,000 · 100,000 · 75,000 · ความแรง 0 ไม่เปลี่ยน · 61 เป็น 60', () => {
  const s = { start: '2026-02-01', end: '2026-04-30', monthMin: 100000, monthMax: 100000, season: { 2: 'peak', 4: 'slow' } };
  assert.deepEqual(['2026-02', '2026-03', '2026-04'].map((m) => incomeOf(gen(s), m)), [125000, 100000, 75000]);
  assert.deepEqual(['2026-02', '2026-04'].map((m) => incomeOf(gen({ ...s, seasonPct: 0 }), m)), [100000, 100000]);
  assert.deepEqual(['2026-02', '2026-04'].map((m) => incomeOf(gen({ ...s, seasonPct: 60 }), m)), [160000, 40000]);
  assert.deepEqual(['2026-02', '2026-04'].map((m) => incomeOf(gen({ ...s, seasonPct: 61 }), m)), [160000, 40000]);
});

test('FR_SET_120 · TC-SET-056: โหมดรายวันเดือนขายดี ▲ ทุกวัน 5,000 (รวม 130,000) · ▼ 3,000 (รวม 78,000) · ปกติ 104,000', () => {
  const day = { mode: 'day', dayMin: 4000, dayMax: 4000 };
  assert.equal(incomeOf(gen(day), '2026-03'), 104000);
  const up = gen({ ...day, season: { 3: 'peak' } });
  assert.ok(Object.values(perDay(up)).every((v) => v === 5000));
  assert.equal(incomeOf(up, '2026-03'), 130000);
  const dn = gen({ ...day, season: { 3: 'slow' } });
  assert.ok(Object.values(perDay(dn)).every((v) => v === 3000));
  assert.equal(incomeOf(dn, '2026-03'), 78000);
});

test('FR_SET_120 · TC-SET-057: เดือนที่ผู้ใช้กำหนดยอดเองไม่ถูกคูณ', () => {
  assert.equal(incomeOf(gen({ season: { 3: 'peak' }, monthlyRevenue: { '2026-03': 100000 } }), '2026-03'), 100000);
});

test('FR_SET_120 · TC-SET-058: เดือนขายดีใช้ตามเดือนปฏิทินทุกปี (มี.ค. 2027 = 125,000 ส่วน ธ.ค. 2026 ปกติ)', () => {
  const rows = gen({ start: '2026-12-01', end: '2027-03-31', monthMin: 100000, monthMax: 100000, season: { 3: 'peak' } });
  assert.deepEqual(['2026-12', '2027-01', '2027-02', '2027-03'].map((m) => incomeOf(rows, m)), [100000, 100000, 100000, 125000]);
});

test('FR_GEN_020 · TC-SET-059: เป้าสุ่มของเดือนขายดี/ซบเซาอยู่ในช่วงที่คูณแล้ว (ขายดี 100,000–125,000 · ซบเซา 60,000–75,000) หาร 100 ลงตัว', () => {
  const season = {};
  for (let m = 1; m <= 9; m++) season[m] = 'peak';
  for (let m = 10; m <= 12; m++) season[m] = 'slow';
  const rows = gen({ start: '2026-01-01', end: '2026-12-31', monthMin: 80000, monthMax: 100000, season, seed: '' });
  for (let m = 1; m <= 12; m++) {
    const v = incomeOf(rows, '2026-' + String(m).padStart(2, '0'));
    const [lo, hi] = m <= 9 ? [100000, 125000] : [60000, 75000];
    assert.ok(v >= lo && v <= hi && v % 100 === 0, `${m}: ${v}`);
  }
});

test('FR_SET_130 · TC-SET-060/061: รายการรายรับต่อวัน 1–1 ได้ 26 แถว · 3–3 ได้ 78 · 6–6 ได้ 156 · ยอดวันเท่ากัน (3,460 วันสุดท้าย 3,500) · 0→1 · 7→6 · สลับให้', () => {
  const flat = { weekendPct: 0, jitterPct: 0 };
  for (const n of [1, 3, 6]) {
    const rows = gen({ ...flat, txMin: n, txMax: n });
    assert.equal(inc(rows).length, 26 * n);
    const vals = Object.values(perDay(rows));
    assert.deepEqual(vals.slice(0, -1).filter((v) => v !== 3460), []);
    assert.equal(vals[vals.length - 1], 3500);
    assert.equal(incomeOf(rows, '2026-03'), 90000);
  }
  assert.equal(inc(gen({ ...flat, txMin: 0, txMax: 0 })).length, 26);
  assert.equal(inc(gen({ ...flat, txMin: 7, txMax: 7 })).length, 26 * 6);
  const count = {};
  for (const r of inc(gen({ ...flat, txMin: 4, txMax: 2, seed: '' }))) count[r.date] = (count[r.date] || 0) + 1;
  assert.ok(Object.values(count).every((c) => c >= 2 && c <= 4));
});

test('FR_SET_130 · TC-SET-062: ยอดวันน้อยลดจำนวนรายการ (90 → 1 แถว · 250 → ไม่เกิน 2 · 650 → ไม่เกิน 6) ยอดวันเท่าเดิม', () => {
  for (const [v, max] of [[90, 1], [250, 2], [650, 6]]) {
    const rows = gen({ mode: 'day', dayMin: v, dayMax: v, txMin: 6, txMax: 6, weekendPct: 0 });
    const count = {};
    for (const r of inc(rows)) count[r.date] = (count[r.date] || 0) + 1;
    assert.ok(Object.values(count).every((c) => c <= max), String(v));
    assert.ok(Object.values(perDay(rows)).every((s) => s === v));
  }
});

test('FR_SET_130 · TC-SET-063: วันเดียวกันแตกเป็นหมวดรายรับต่างกันได้ (พบทั้ง 2 หมวด)', () => {
  const rows = gen({ txMin: 3, txMax: 3 });
  assert.deepEqual([...new Set(inc(rows).map((r) => r.name))].sort(), ['ขายหน้าร้าน', 'เดลิเวอรี']);
  assert.ok(Object.keys(perDay(rows)).some((d) => new Set(inc(rows).filter((r) => r.date === d).map((r) => r.name)).size > 1));
});

test('FR_SET_140 · TC-SET-064/065: แกว่ง 0% → จันทร์–พฤหัสเท่ากัน ศุกร์ 3,720 · ผลไม่เปลี่ยนเมื่อสุ่มใหม่ · 60% ต่างกันมาก · 61 เป็น 60 · −1 เป็น 0', () => {
  const a = perDay(gen({ jitterPct: 0, seed: '' }));
  assert.deepEqual(a, perDay(gen({ jitterPct: 0, seed: '' })));
  const days = Object.keys(a);
  const mt = days.filter((d) => wd(d) >= 1 && wd(d) <= 4 && d !== days[days.length - 1]).map((d) => a[d]);
  assert.ok(mt.every((v) => v === 3240), [...new Set(mt)].join());
  assert.equal(a['2026-03-06'], 3720); // ศุกร์
  const vs = Object.values(perDay(gen({ jitterPct: 60 })));
  assert.ok(Math.max(...vs) / Math.min(...vs) > 2);
  assert.deepEqual(perDay(gen({ jitterPct: 61, seed: 'k' })), perDay(gen({ jitterPct: 60, seed: 'k' })));
  assert.deepEqual(perDay(gen({ jitterPct: -1, seed: 'k' })), perDay(gen({ jitterPct: 0, seed: 'k' })));
});

test('FR_SET_150 · TC-SET-067/068/069: seed เดิมตั้งค่าเดิม → ตารางเดิมทุกแถว · seed ต่างผลต่าง · ว่างสุ่มทุกครั้ง', () => {
  assert.deepEqual(gen({ seed: 'abc' }), gen({ seed: 'abc' }));
  assert.notDeepEqual(gen({ seed: 'abc' }), gen({ seed: 'abd' }));
  assert.notDeepEqual(gen({ seed: '' }), gen({ seed: '' }));
  assert.deepEqual(gen({ seed: 12345 }), gen({ seed: '12345' }));
});

test('NFR_PERF_010 · TC-PERF-001/006: สร้างช่วง 366 วันเสร็จใน 1 วินาที (ฝั่งตรรกะ) ครบ 13 เดือนปฏิทิน', () => {
  const t0 = performance.now();
  const rows = gen({ start: '2026-01-01', end: '2027-01-01', closedWeekdays: [], seed: '' });
  assert.ok(performance.now() - t0 < 1000);
  assert.equal(L.dayCount('2026-01-01', '2027-01-01'), 366);
  assert.equal(L.monthsIn('2026-01-01', '2027-01-01').length, 13);
  assert.ok(inc(rows).length >= 366 && new Set(inc(rows).map((r) => r.date)).size === 366);
});

test('FR_TBL_020 · TC-TBL-002/003: รายการเรียงตามวันที่เก่า→ใหม่ วันเดียวกันคงลำดับเดิม', () => {
  const rows = gen();
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].date <= rows[i].date);
  const s = L.sortRows([{ date: '2026-03-02', name: 'b' }, { date: '2026-03-01', name: 'x' }, { date: '2026-03-02', name: 'a' }]);
  assert.deepEqual(s.map((r) => r.name), ['x', 'b', 'a']);
});

test('BR_060 · TC-GEN-025..028: แผนที่เกินเพดานถูกตัด (รายรับ 5 · รายวัน 2 · สัปดาห์ 3 · เดือน 8) แผนที่ไม่เกินผ่านครบ', () => {
  const exp = (n, freq) => Array.from({ length: n }, (_, i) => ({ name: `${freq}${i}`, pct: 1, freq, day: 1 }));
  const rev = (n) => Array.from({ length: n }, (_, i) => ({ name: 'r' + i, weight: 1 }));
  const count = (p, f) => p.expenses.filter((e) => e.freq === f).length;
  for (const [n, want] of [[4, 4], [5, 5], [6, 5]]) assert.equal(sanitizePlan({ revenue: rev(n), expenses: exp(1, 'daily') }).revenue.length, want);
  for (const [f, cap] of [['daily', 2], ['weekly', 3], ['monthly', 8]]) {
    for (const d of [-1, 0, 1]) assert.equal(count(sanitizePlan({ revenue: rev(1), expenses: exp(cap + d, f) }), f), Math.min(cap, cap + d), f + d);
  }
});

test('FR_GEN_030 · TC-GEN-029: ร้อยละรวมรายจ่ายนอก 65–90 ไม่ถูกบังคับ (64 → 57,600 · 91 → 81,900 จากรายรับ 90,000)', () => {
  for (const [pct, want] of [[64, 57600], [65, 58500], [90, 81000], [91, 81900]]) {
    const a = Math.min(60, pct);
    const rows = gen({}, { revenue: planA.revenue, expenses: [{ name: 'หมวด 1', pct: a, freq: 'monthly', day: 1 }, { name: 'หมวด 2', pct: pct - a, freq: 'monthly', day: 2 }] });
    assert.equal(r2(rows.reduce((x, r) => x + r.expense, 0)), want, String(pct));
  }
});
