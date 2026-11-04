/* แผงตั้งค่า (FR-SET-020..150 · FR-GEN-040/050/080 · FR-STO-020 · NFR-USE-010) — เปิดหน้าจริง */
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../test-kit/e2e-kit.js');

const { skip, open, state, toast, table, sumOf, gen, fillNum, planA } = K;
const o = { skip, timeout: 60000 };
test.after(() => K.shutdown());
const A = { settings: { type: 'other' }, plan: planA };
const val = (page, sel) => page.locator(sel).inputValue();
const setDates = async (page, a, b) => { await page.locator('#start').fill(a); await page.locator('#end').fill(b); };
const openAdv = (page) => page.locator('details.adv summary').click();
const inMonth = (rows, m) => rows.filter((r) => r.date.startsWith(m));
const incomeOf = (rows, m) => sumOf(inMonth(rows, m), 'income');

test('FR_SET_020 · TC-SET-003/004: ค่าตั้งต้นช่วงวันที่คือเดือนปัจจุบัน (พ.ย. 2026) ช่องกำหนดเอง 1 ช่องว่าง · เดือน ก.พ. ปีอธิกสุรทิน 2028-02-01..29', o, async () => {
  const page = await open();
  assert.deepEqual([await val(page, '#start'), await val(page, '#end')], ['2026-11-01', '2026-11-30']);
  assert.equal(await page.locator('#months input').count(), 1);
  assert.equal(await val(page, '#months input'), '');
  await K.closeAll(page);
  const ctx = await K.boot();
  const p2 = await ctx.browser.newPage();
  await p2.clock.setFixedTime(new Date('2028-02-10T10:00:00'));
  await p2.goto(ctx.base + '/');
  assert.deepEqual([await val(p2, '#start'), await val(p2, '#end')], ['2028-02-01', '2028-02-29']);
  await p2.close();
});

test('FR_SET_020 · FR_GEN_080 · TC-SET-005..012 · TC-GEN-044: เริ่ม>สิ้นสุด ถูกปฏิเสธ · 1 วัน ผ่าน · 365/366 ผ่าน · 367 ปฏิเสธและแจ้ง · วันที่ว่างแจ้งให้กรอก · ไม่สร้างตาราง', o, async () => {
  const page = await open({ state: A });
  const tryGen = async () => { await page.locator('#btn-gen').click(); return toast(page); };
  await setDates(page, '2026-03-31', '2026-03-30');
  assert.match(await page.locator('#settings-err').innerText(), /วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด/);
  assert.match(await tryGen(), /ช่วงวันที่/);
  assert.equal((await table(page)).length, 0);
  await setDates(page, '2026-03-31', '2026-03-31');
  assert.equal(await page.locator('#settings-err').isVisible(), false);
  assert.ok((await gen(page)).length > 0, '1 วันผ่าน');
  await setDates(page, '2026-01-01', '2026-12-31');
  assert.ok((await gen(page)).length > 0, '365 วันผ่าน');
  await setDates(page, '2026-01-01', '2027-01-01');
  assert.equal(await page.locator('#settings-err').isVisible(), false, '366 วันที่ขอบผ่าน');
  const rows = await gen(page);
  assert.ok(rows.length > 0 && rows[rows.length - 1].date >= '2026-12-31');
  const before = await table(page);
  await setDates(page, '2026-01-01', '2027-01-02');
  assert.match(await page.locator('#settings-err').innerText(), /366 วัน/);
  assert.match(await tryGen(), /366 วัน/);
  assert.deepEqual(await table(page), before, 'ตารางเดิมไม่เปลี่ยน');
  await page.locator('#start').fill('');
  assert.match(await page.locator('#settings-err').innerText(), /กรอก/);
  assert.match(await tryGen(), /กรอก/);
  // ปี 2028 มี 366 วัน (อธิกสุรทิน) ผ่าน
  await setDates(page, '2028-01-01', '2028-12-31');
  assert.equal(await page.locator('#settings-err').isVisible(), false);
  await K.closeAll(page);
});

test('FR_SET_020 · TC-SET-012: ช่องวันที่ไม่รับค่าที่ไม่ใช่วันที่จริง (abc · 2027-02-29 → ค่าว่าง)', o, async () => {
  const page = await open({ state: A });
  const set = (v) => page.locator('#end').evaluate((el, x) => { el.value = x; return el.value; }, v);
  assert.equal(await set('abc'), '');
  assert.equal(await set('2027-02-29'), '');
  await K.closeAll(page);
});

test('FR_SET_090 · TC-SET-013/014: ช่วง 15 มี.ค.–10 พ.ค. มีช่องกำหนดเอง 3 ช่อง (มี.ค. เม.ย. พ.ค.) ว่าง · ตัดเหลือ 30 เม.ย. → 2 ช่อง · ข้ามเดือน 2 วัน → 2 ช่อง', o, async () => {
  const page = await open({ state: A });
  await setDates(page, '2026-03-15', '2026-05-10');
  const labels = await page.$$eval('#months input', (els) => els.map((e) => e.getAttribute('aria-label') + '|' + e.value));
  assert.equal(labels.length, 3);
  assert.ok(labels.every((l) => l.endsWith('|')) && /03\/2569/.test(labels[0]) && /05\/2569/.test(labels[2]));
  await page.locator('#end').fill('2026-04-30');
  assert.equal(await page.locator('#months input').count(), 2);
  await setDates(page, '2026-03-31', '2026-04-01');
  assert.equal(await page.locator('#months input').count(), 2);
  await K.closeAll(page);
});

test('FR_SET_070 · FR_SET_080 · TC-SET-015/016/017/031/032: โหมดตั้งต้นต่อเดือน แสดงเฉพาะช่องของโหมด · สลับต่อวันเห็นช่องรายวันและข้อความประมาณ (65,000 / 55,000 / 52,500) · ค่าคงอยู่เมื่อสลับ', o, async () => {
  const page = await open({ state: A });
  assert.equal(await page.locator('#mode [data-mode=month]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual([await page.locator('#box-month').isVisible(), await page.locator('#box-day').isVisible()], [true, false]);
  await fillNum(page, '#mmin', 70000); await fillNum(page, '#mmax', 90000);
  await page.locator('#mode [data-mode=day]').click();
  assert.deepEqual([await page.locator('#box-month').isVisible(), await page.locator('#box-day').isVisible()], [false, true]);
  assert.equal(await page.locator('#months').isVisible(), false);
  await fillNum(page, '#dmin', 2500); await fillNum(page, '#dmax', 2500);
  assert.match(await page.locator('#day-est').innerText(), /65,000/);
  await page.locator('#wdays [data-wd="6"]').click();
  assert.match(await page.locator('#day-est').innerText(), /55,000/);
  await page.locator('details.sub:has(#closed-dates) summary').click();
  await page.locator('#closed-new').fill('2026-03-10'); await page.locator('#btn-closed-add').click();
  assert.match(await page.locator('#day-est').innerText(), /52,500/);
  await fillNum(page, '#dmin', 2000); await fillNum(page, '#dmax', 3000);
  await page.locator('#mode [data-mode=month]').click();
  assert.deepEqual([await val(page, '#mmin'), await val(page, '#mmax')], ['70000', '90000']);
  await page.locator('#mode [data-mode=day]').click();
  assert.deepEqual([await val(page, '#dmin'), await val(page, '#dmax')], ['2000', '3000']);
  await K.closeAll(page);
});

test('FR_SET_030 · FR_SET_080 · D-06 · TC-SET-020/022/033: ตั้งแต่>ถึง สลับให้ · −1 → 0 · 0–0 รับ · ทศนิยมปัด · ไม่ใช่ตัวเลขไม่เกิด NaN (ทั้งโหมดเดือนและวัน)', o, async () => {
  const page = await open({ state: A });
  for (const [mode, lo, hi] of [['month', '#mmin', '#mmax'], ['day', '#dmin', '#dmax']]) {
    await page.locator(`#mode [data-mode=${mode}]`).click();
    await fillNum(page, lo, 3000); await fillNum(page, hi, 2000);
    assert.deepEqual([await val(page, lo), await val(page, hi)], ['2000', '3000'], mode);
    await fillNum(page, lo, -1);
    assert.equal(await val(page, lo), '0');
    await fillNum(page, lo, 0); await fillNum(page, hi, 0);
    assert.deepEqual([await val(page, lo), await val(page, hi)], ['0', '0']);
    await fillNum(page, hi, 'abc').catch(() => {});
    assert.ok(!(await val(page, hi)).includes('NaN'));
  }
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});

test('FR_SET_090 · D-10 · TC-SET-026/027/028: กำหนดยอดเดือน มี.ค. 120,000 ชนะการสุ่ม · 0/ว่างเท่ากับสุ่ม · ติดลบเป็น 0 · ทศนิยม 2 ตำแหน่งรวมตรง · ค่าคงอยู่เมื่อเปลี่ยนช่วงรายรับ', o, async () => {
  const page = await open({ state: { ...A, settings: { type: 'other', end: '2026-05-31', monthMin: 80000, monthMax: 100000 } } });
  await page.locator('details.sub:has(#months) summary').click();
  const m = (i) => page.locator('#months input').nth(i);
  await m(0).fill('120000'); await m(0).dispatchEvent('change');
  let rows = await gen(page);
  assert.equal(incomeOf(rows, '2026-03'), 120000);
  for (const mo of ['2026-04', '2026-05']) assert.ok(incomeOf(rows, mo) >= 80000 && incomeOf(rows, mo) <= 100000);
  await fillNum(page, '#mmin', 50000); await fillNum(page, '#mmax', 60000);
  assert.equal(await m(0).inputValue(), '120000');
  await m(0).fill('-1'); await m(0).dispatchEvent('change');
  assert.equal(await m(0).inputValue(), '');
  await m(0).fill('0'); await m(0).dispatchEvent('change');
  assert.equal(await m(0).inputValue(), '');
  rows = await gen(page);
  assert.ok(incomeOf(rows, '2026-03') >= 50000 && incomeOf(rows, '2026-03') <= 60000, 'D-10: 0 = สุ่มตามช่วง');
  await m(0).fill('1'); await m(0).dispatchEvent('change');
  assert.equal(incomeOf(await gen(page), '2026-03'), 1);
  await m(0).fill('12345.67'); await m(0).dispatchEvent('change');
  assert.equal(incomeOf(await gen(page), '2026-03'), 12345.67);
  await K.closeAll(page);
});

test('FR_SET_040 · FR_SET_050 · TC-SET-034..040 · TC-SET-073: วันหยุดประจำสัปดาห์หลายวัน · ไม่เลือก = ทุกวันเปิด · วันหยุดพิเศษเพิ่ม/ลบ/ไม่ซ้ำ/ค่าว่างไม่รับ · หัวข้อพับแสดงจำนวน (0) และยังมีผลเมื่อพับ', o, async () => {
  const page = await open({ state: A });
  const special = page.locator('details.sub:has(#closed-dates)');
  assert.equal(await special.evaluate((e) => e.open), false);
  assert.match(await special.locator('summary').innerText(), /\(0\)/);
  await special.locator('summary').click();
  await page.locator('#closed-new').fill('2026-03-10'); await page.locator('#btn-closed-add').click();
  await page.locator('#closed-new').fill('2026-03-10'); await page.locator('#btn-closed-add').click();
  await page.locator('#btn-closed-add').click(); // ค่าว่าง
  assert.equal(await page.locator('#closed-dates .chip').count(), 1);
  assert.match(await special.locator('summary').innerText(), /\(1\)/);
  await special.locator('summary').click(); // พับกลับ
  const rows = await gen(page);
  assert.equal(rows.filter((r) => r.date === '2026-03-10').length, 0);
  assert.equal(rows.filter((r) => r.date === '2026-03-01').length, 0);
  await page.locator('#wdays [data-wd="6"]').click();
  assert.equal(await page.locator('#wdays [aria-pressed=true]').count(), 2);
  assert.equal((await gen(page)).filter((r) => r.date === '2026-03-07' && r.income).length, 0);
  await page.locator('#wdays [data-wd="6"]').click(); await page.locator('#wdays [data-wd="0"]').click();
  assert.equal(await page.locator('#wdays [aria-pressed=true]').count(), 0);
  assert.ok((await gen(page)).some((r) => r.date === '2026-03-01' && r.income > 0), 'ไม่เลือกวันหยุดเลย ทุกวันเปิด');
  await special.locator('summary').click();
  await page.locator('#closed-dates [data-rm]').click();
  assert.equal(await page.locator('#closed-dates .chip').count(), 0);
  assert.ok((await gen(page)).some((r) => r.date === '2026-03-10' && r.income > 0), 'ลบวันหยุดพิเศษแล้ววันนั้นเปิด');
  await K.closeAll(page);
});

test('FR_SET_060 · BR_020 · TC-SET-041/042/044: ยอดยกมาตั้งต้น 0 (ช่องว่าง) · 1,000.50 → คงเหลือสุดท้าย 28,000.50 · ทศนิยม 3 ตำแหน่งปัด · ไม่ใช่ตัวเลข → 0', o, async () => {
  const page = await open({ state: A });
  assert.equal(await val(page, '#opening'), '');
  await fillNum(page, '#opening', 1000.5);
  const rows = await gen(page);
  assert.equal(rows[0].bal, 1000.5 + rows[0].income - rows[0].expense);
  assert.equal(rows[rows.length - 1].bal, 28000.5);
  assert.equal(await page.locator('#s-bal').innerText(), '28,000.50');
  await fillNum(page, '#opening', 10.005);
  assert.ok(['10.01', '10', '10.00', '10.0'].includes(await val(page, '#opening')) || (await val(page, '#opening')) === String(Math.round(10.005 * 100) / 100));
  await page.locator('#opening').fill('abc').catch(() => {});
  assert.ok(!(await page.locator('#s-bal').innerText()).includes('NaN'));
  await K.closeAll(page);
});

test('FR_SET_100 · TC-SET-045/046/047/048/050: กำไรเป้าหมายเว้นว่างรายจ่าย 63,000 · 30 → ปรับตามกำไร · บรรทัดสรุป · 96 → 95 · −1 → 0 · ขาดทุนไม่แสดงกำไรติดลบ', o, async () => {
  const page = await open({ state: { settings: { type: 'other', monthMin: 100000, monthMax: 100000 }, plan: { revenue: [{ name: 'ขายหน้าร้าน', weight: 1 }], expenses: [{ name: 'ค่าของ', pct: 45, freq: 'weekly' }, { name: 'ค่าแรง', pct: 45, freq: 'monthly', day: 28 }] } } });
  assert.match(await page.locator('#exp-sum').innerText(), /90%.*10%/);
  assert.equal(sumOf(await gen(page), 'expense'), 90000);
  await fillNum(page, '#margin', 30);
  assert.match(await page.locator('#exp-sum').innerText(), /70%/);
  assert.match(await page.locator('#exp-sum').innerText(), /30%/);
  const rows = await gen(page);
  assert.equal(sumOf(rows, 'expense', (r) => r.name === 'ค่าของ'), 35000);
  assert.equal(sumOf(rows, 'expense', (r) => r.name === 'ค่าแรง'), 35000);
  await fillNum(page, '#margin', 96);
  assert.equal(await val(page, '#margin'), '95');
  await fillNum(page, '#margin', -1);
  assert.equal(await val(page, '#margin'), '0');
  await fillNum(page, '#margin', '');
  assert.equal(await val(page, '#margin'), '');
  await fillNum(page, '#exp-list .prow:not(.head):nth-of-type(2) [data-f=pct]', 60);
  await fillNum(page, '#exp-list .prow:not(.head):nth-of-type(3) [data-f=pct]', 50);
  assert.match(await page.locator('#exp-sum').innerText(), /110%.*ขาดทุน/);
  assert.ok(!/-\d/.test(await page.locator('#exp-sum').innerText()));
  await K.closeAll(page);
});

test('FR_SET_110/120/130/140/150 · D-02 · TC-SET-072/073: ค่าตั้งต้นของตั้งค่าใหม่ (30 · 25 · 1–2 · 25 · ล็อกว่าง · ทุกเดือนปกติ · กำไรว่าง) และหัวข้อพับปิดอยู่', o, async () => {
  const page = await open();
  for (const sel of ['details.adv', 'details.sub:has(#months)', 'details.sub:has(#closed-dates)']) assert.equal(await page.locator(sel).evaluate((e) => e.open), false, sel);
  await openAdv(page);
  assert.deepEqual(await Promise.all(['#weekendPct', '#seasonPct', '#txMin', '#txMax', '#jitterPct', '#seed', '#margin'].map((s) => val(page, s))), ['30', '25', '1', '2', '25', '', '']);
  assert.equal(await page.locator('#season .chip').count(), 12);
  assert.equal((await page.$$eval('#season .chip', (els) => els.map((e) => e.textContent).join(''))).includes('▲'), false);
  await page.locator('details.sub:has(#months) summary').click();
  assert.equal(await page.locator('#months input').count(), 1);
  await K.closeAll(page);
});

test('FR_SET_110/140 · D-06 · TC-SET-052/065: ช่องสุดสัปดาห์ −1 → 0 · 101 → 100 · แกว่ง −1 → 0 · 61 → 60 · ความแรง 61 → 60 · ว่าง → ค่าตั้งต้น', o, async () => {
  const page = await open({ state: A });
  await openAdv(page);
  for (const [sel, input, want] of [['#weekendPct', -1, '0'], ['#weekendPct', 101, '100'], ['#weekendPct', 100, '100'], ['#jitterPct', -1, '0'], ['#jitterPct', 61, '60'], ['#jitterPct', 60, '60'], ['#seasonPct', 61, '60'], ['#seasonPct', -1, '0'], ['#weekendPct', '', '30']]) {
    await fillNum(page, sel, input);
    assert.equal(await val(page, sel), want, `${sel} ${input}`);
  }
  await K.closeAll(page);
});

test('FR_SET_120 · TC-SET-053: กดเดือนวน ปกติ → ▲ → ▼ → ปกติ · ตั้ง ก.ค. ▲ ธ.ค. ▼ แล้วรีโหลดยังอยู่', o, async () => {
  const page = await open({ state: A });
  await openAdv(page);
  const jan = page.locator('#season [data-m="1"]');
  assert.equal(await jan.innerText(), 'ม.ค.');
  await jan.click(); assert.equal(await jan.innerText(), 'ม.ค. ▲');
  assert.equal(await page.locator('#season [data-m="2"]').innerText(), 'ก.พ.');
  await jan.click(); assert.equal(await jan.innerText(), 'ม.ค. ▼');
  await jan.click(); assert.equal(await jan.innerText(), 'ม.ค.');
  await page.locator('#season [data-m="7"]').click();
  await page.locator('#season [data-m="12"]').click(); await page.locator('#season [data-m="12"]').click();
  await page.reload(); await openAdv(page);
  assert.equal(await page.locator('#season [data-m="7"]').innerText(), 'ก.ค. ▲');
  assert.equal(await page.locator('#season [data-m="12"]').innerText(), 'ธ.ค. ▼');
  await K.closeAll(page);
});

test('FR_SET_120 · TC-SET-054: เดือน ก.พ. ▲ มี.ค. ปกติ เม.ย. ▼ (ผ่านหน้าจอ) → 125,000 · 100,000 · 75,000', o, async () => {
  const page = await open({ state: { settings: { type: 'other', start: '2026-02-01', end: '2026-04-30', monthMin: 100000, monthMax: 100000 }, plan: planA } });
  await openAdv(page);
  await page.locator('#season [data-m="2"]').click();
  await page.locator('#season [data-m="4"]').click(); await page.locator('#season [data-m="4"]').click();
  const rows = await gen(page);
  assert.deepEqual(['2026-02', '2026-03', '2026-04'].map((m) => incomeOf(rows, m)), [125000, 100000, 75000]);
  await K.closeAll(page);
});

test('FR_SET_130 · D-06 · TC-SET-061: รายการรายรับต่อวัน 0 → 1 · 7 → 6 · อย่างน้อย 4 มากสุด 2 → สลับเป็น 2–4 · ตั้ง 3–3 ได้ 78 แถวรายรับ', o, async () => {
  const page = await open({ state: A });
  await openAdv(page);
  await fillNum(page, '#txMin', 0); await fillNum(page, '#txMax', 0);
  assert.deepEqual([await val(page, '#txMin'), await val(page, '#txMax')], ['1', '1']);
  await fillNum(page, '#txMax', 7);
  assert.equal(await val(page, '#txMax'), '6');
  await fillNum(page, '#txMax', 4); await fillNum(page, '#txMin', 4);
  await fillNum(page, '#txMax', 2);
  assert.deepEqual([await val(page, '#txMin'), await val(page, '#txMax')], ['2', '2']);
  await fillNum(page, '#txMin', 3); await fillNum(page, '#txMax', 3);
  const rows = await gen(page);
  assert.equal(rows.filter((r) => r.income > 0).length, 78);
  assert.equal(sumOf(rows, 'income'), 90000);
  await K.closeAll(page);
});

test('FR_SET_150 · FR_GEN_040 · TC-SET-067..071 · TC-GEN-017/020..024/045: ล็อกผลสุ่ม ตัวที่ 21 ไม่ถูกรับ · สุ่มใหม่ขณะล็อกได้ผลเดิมและแจ้ง · ล้างช่องแล้วสุ่มใหม่ผลต่าง · ย้อนกลับ 1 ขั้น · สร้างซ้ำแทนที่ทั้งชุด', o, async () => {
  const page = await open({ state: A });
  assert.equal(await page.locator('#btn-undo').isDisabled(), true, 'ก่อนสร้าง ย้อนกลับปิด');
  assert.equal(await page.locator('#btn-regen').isDisabled(), true, 'ก่อนสร้าง สุ่มใหม่ปิด');
  await openAdv(page);
  await page.locator('#seed').fill('abcdefghij0123456789Z');
  assert.equal(await val(page, '#seed'), 'abcdefghij0123456789');
  const r1 = await gen(page);
  assert.equal(sumOf(r1, 'income'), 90000);
  await page.locator('#btn-regen').click();
  assert.deepEqual(await table(page), r1);
  assert.match(await toast(page), /ล็อกผลสุ่ม/);
  await page.locator('#seed').fill('');
  await page.locator('#btn-regen').click();
  const r3 = await table(page);
  assert.notDeepEqual(r3, r1);
  assert.equal(sumOf(r3, 'income'), 90000);
  await page.locator('#btn-undo').click();
  assert.deepEqual(await table(page), r1, 'ย้อนกลับคืนตารางก่อนสุ่มใหม่');
  assert.equal(await page.locator('#btn-undo').isDisabled(), true, 'ย้อนได้ 1 ขั้นเท่านั้น');
  const again = await gen(page);
  assert.equal(sumOf(again, 'income'), 90000, 'สร้างซ้ำแทนที่ทั้งชุด ไม่ต่อท้าย');
  await page.locator('#btn-undo').click();
  assert.deepEqual(await table(page), r1);
  await K.closeAll(page);
});

test('FR_GEN_050 · TC-GEN-020/021/023: ย้อนกลับคืนตารางก่อนสร้างครั้งล่าสุด · หลังสร้างครั้งแรกย้อนได้ตารางว่าง', o, async () => {
  const page = await open({ state: A });
  await gen(page);
  await page.locator('#btn-undo').click();
  assert.equal((await table(page)).length, 0);
  await K.closeAll(page);
});

test('FR_GEN_080 · D-08 · TC-GEN-042/043: ข้อความสั้นบอกจำนวนรายการ = จำนวนใต้ตาราง = ตัวเลขแท็บ · หายเองราว 2.8 วินาที · สร้างได้ 0 รายการแจ้งสาเหตุ', o, async () => {
  const page = await open({ state: A });
  await page.locator('#btn-gen').click();
  const n = (await table(page)).length;
  const t = await toast(page);
  assert.ok(t.includes(String(n)) && /ย้อนกลับ/.test(t), t);
  assert.equal(await page.locator('#s-n').innerText(), String(n));
  assert.match(await page.locator('#tab-count').innerText(), new RegExp(String(n)));
  const t0 = Date.now();
  await page.locator('#toast').waitFor({ state: 'hidden', timeout: 6000 });
  const dt = Date.now() - t0;
  assert.ok(dt >= 1800 && dt <= 3500, `หายเองที่ ${dt} ms`);
  for (let d = 0; d < 7; d++) if (await page.locator(`#wdays [data-wd="${d}"][aria-pressed=false]`).count()) await page.locator(`#wdays [data-wd="${d}"]`).click();
  await page.locator('#btn-gen').click();
  assert.match(await toast(page), /ไม่ได้สร้างรายการ/);
  assert.equal((await table(page)).length, 0);
  await K.closeAll(page);
});

test('FR_STO_020 · D-07 · TC-STO-003..006: "ล้างทั้งหมด" กดครั้งแรกขอยืนยันในหน้า (ไม่มี dialog) · ไม่กดซ้ำใน 4 วินาทีกลับเป็นเดิม ข้อมูลคงอยู่ · กดซ้ำล้างเป็นสถานะเริ่มต้น', o, async () => {
  const page = await open({ state: A });
  let dialogs = 0; page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await gen(page);
  const b = page.locator('#btn-clear');
  await b.click();
  assert.match(await b.innerText(), /อีกครั้ง/);
  assert.ok((await table(page)).length > 0);
  await page.waitForFunction(() => document.getElementById('btn-clear').textContent === 'ล้างทั้งหมด', null, { timeout: 6000 });
  assert.ok((await table(page)).length > 0, 'ไม่ยืนยัน ข้อมูลยังอยู่');
  await b.click(); await b.click();
  assert.equal((await table(page)).length, 0);
  const st = await state(page);
  assert.equal(st.settings.type, '');
  assert.deepEqual(st.settings.closedWeekdays, [0]);
  assert.equal(dialogs, 0);
  await K.closeAll(page);
});
