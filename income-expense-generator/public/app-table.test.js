/* ตาราง · ส่งออก Excel · เก็บสถานะ · ความปลอดภัยหน้าจอ · ใช้งาน · ความเชื่อถือได้ (FR-TBL · FR-EXP · FR-STO · NFR-SEC · NFR-USE · NFR-REL · BR-010/020) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const K = require('../test-kit/e2e-kit.js');

const { skip, open, state, toast, table, sumOf, gen, fillNum, names, planA } = K;
const o = { skip, timeout: 90000 };
test.after(() => K.shutdown());
const A = { settings: { type: 'other' }, plan: planA };
/** ตาราง T3: ยอดยกมา 1,000 · A 03-02 รับ 500 · B 03-03 จ่าย 200 · C 03-04 รับ 300 */
const T3 = { settings: { type: 'other', opening: 1000 }, plan: planA, nextId: 4, rows: [
  { id: 1, date: '2026-03-02', name: 'A', income: 500, expense: 0 }, { id: 2, date: '2026-03-03', name: 'B', income: 0, expense: 200 }, { id: 3, date: '2026-03-04', name: 'C', income: 300, expense: 0 }] };
const row = (page, i) => page.locator('#rows tr').nth(i);
const edit = async (page, i, f, v) => { const l = row(page, i).locator(`[data-f=${f}]`); await l.fill(String(v)); await l.dispatchEvent('change'); };
const bals = async (page) => (await table(page)).map((r) => r.bal);
const sum4 = async (page) => Promise.all(['#s-in', '#s-out', '#s-bal', '#s-n'].map((s) => page.locator(s).innerText()));

test('FR_TBL_010 · FR_TBL_100 · TC-TBL-001/026/027: ตาราง 5 คอลัมน์เรียงตามลำดับ มีคำอธิบายใต้ชื่อ · หัวรายการหมวดมีแถวเดียวต่อรายการ ไม่ซ้ำเมื่อเพิ่มหมวด คำอธิบายอยู่หลังรีโหลด', o, async () => {
  const page = await open({ state: T3 });
  const th = await page.$$eval('#tbl thead th:not(.x)', (els) => els.map((e) => [e.firstChild.textContent.trim(), e.querySelector('small').textContent]));
  assert.deepEqual(th, [['วันที่', 'วัน-เดือน-ปี'], ['รายการ', 'ชื่อ แก้ได้'], ['รายรับ', 'เงินเข้า (บาท)'], ['รายจ่าย', 'เงินออก (บาท)'], ['คงเหลือ', 'เงินสะสม (บาท)']]);
  const head = (sel) => page.$$eval(`${sel} .prow.head > span`, (els) => els.map((e) => e.textContent));
  assert.deepEqual((await head('#rev-list')).slice(0, 2), ['ชื่อหมวดรายรับมาจากอะไร', 'สัดส่วนเทียบกัน']);
  assert.deepEqual((await head('#exp-list')).slice(0, 4), ['ชื่อหมวดจ่ายค่าอะไร', '%ของรายรับ', 'ความถี่จ่ายบ่อยแค่ไหน', 'วันที่รายเดือน']);
  await page.locator('#btn-rev-add').click(); await page.locator('#btn-exp-add').click();
  assert.equal(await page.locator('#rev-list .prow.head').count(), 1);
  assert.equal(await page.locator('#exp-list .prow.head').count(), 1);
  await page.reload();
  assert.equal(await page.locator('#tbl thead small').count(), 5);
  await K.closeAll(page);
  const m = await open({ state: T3, width: 390, height: 800 });
  await m.locator('.tabs [data-tab=ledger]').click();
  const over = await m.$$eval('#tbl thead th small', (els) => els.map((e) => e.scrollWidth <= e.parentElement.clientWidth + 1));
  assert.ok(over.every(Boolean), 'คำอธิบายไม่ล้นคอลัมน์');
  await K.closeAll(m);
});

test('FR_TBL_030 · FR_TBL_060 · TC-TBL-004/005: เพิ่มรายการเอง 3 แถว (ยอดยกมา 1,000) คงเหลือ 1,500 · 1,300 · 1,600 · ยอดยกมา 0 ติดลบแสดงเครื่องหมายลบ', o, async () => {
  const page = await open({ state: { settings: { type: 'other', opening: 1000 }, plan: planA } });
  const add = async (date, name, f, v) => {
    await page.locator('#btn-add').click();
    const i = (await table(page)).length - 1;
    await page.locator('#rows tr').filter({ has: page.locator('[data-f=name]') }).nth(i); // แถวใหม่ถูกเรียงต่อท้ายถ้าวันที่ใหม่กว่า
    await edit(page, i, 'date', date); await edit(page, (await table(page)).findIndex((r) => r.name === 'รายการใหม่'), 'name', name);
    const j = (await table(page)).findIndex((r) => r.name === name);
    await row(page, j).locator(`[data-f=${f}]`).fill(String(v));
  };
  await add('2026-03-02', 'A', 'income', 500);
  assert.deepEqual(await bals(page), [1500]);
  await add('2026-03-03', 'B', 'expense', 200);
  await add('2026-03-04', 'C', 'income', 300);
  assert.deepEqual(await bals(page), [1500, 1300, 1600]);
  await K.closeAll(page);
  const p0 = await open({ state: { settings: { type: 'other' }, plan: planA, nextId: 3, rows: [{ id: 1, date: '2026-03-02', name: 'A', income: 500, expense: 0 }, { id: 2, date: '2026-03-03', name: 'B', income: 0, expense: 800 }] } });
  assert.deepEqual(await bals(p0), [500, -300]);
  assert.equal(await p0.locator('#rows tr .bal.neg').count(), 1);
  await K.closeAll(p0);
});

test('FR_TBL_030 · FR_TBL_040 · TC-TBL-006/007/008/009: แก้จำนวนเงิน/ยอดยกมา/วันที่/ชื่อ → คงเหลือคำนวณใหม่ทันที · แถวย้ายตามวันที่', o, async () => {
  const page = await open({ state: T3 });
  await edit(page, 1, 'expense', 700);
  assert.deepEqual(await bals(page), [1500, 800, 1100]);
  await fillNum(page, '#opening', 2000);
  assert.deepEqual(await bals(page), [2500, 1800, 2100]);
  await fillNum(page, '#opening', 1000);
  await edit(page, 1, 'expense', 200);
  await edit(page, 2, 'date', '2026-03-01');
  assert.deepEqual((await table(page)).map((r) => [r.name, r.bal]), [['C', 1300], ['A', 1800], ['B', 1600]]);
  await edit(page, 1, 'name', 'ขายส่งลูกค้าประจำ');
  assert.deepEqual((await table(page)).map((r) => [r.name, r.income, r.expense]), [['C', 300, 0], ['ขายส่งลูกค้าประจำ', 500, 0], ['B', 0, 200]]);
  await K.closeAll(page);
});

test('BR_020 · TC-TBL-010/011/012: จำนวนเงิน −0.01 · abc ไม่รับ ค่ากลับเป็นเดิมพร้อมข้อความ · 0 และ 0.01 รับ · 12.34 รับ · 12.345 ไม่เก็บทศนิยม 3 ตำแหน่ง · ไม่เกิด NaN', o, async () => {
  const page = await open({ state: T3 });
  await edit(page, 0, 'income', '-0.01');
  assert.equal(await row(page, 0).locator('[data-f=income]').inputValue(), '500');
  assert.match(await toast(page), /ตัวเลข/);
  assert.equal((await bals(page))[0], 1500);
  await edit(page, 1, 'expense', 'abc');
  assert.equal(await row(page, 1).locator('[data-f=expense]').inputValue(), '200');
  await edit(page, 0, 'income', '0.01');
  assert.equal((await bals(page))[0], 1000.01);
  await edit(page, 0, 'income', '12.34');
  assert.equal((await table(page))[0].income, 12.34);
  await edit(page, 0, 'income', '12.345');
  const v = (await table(page))[0].income;
  assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 && (v === 12.34 || v === 12.35), String(v));
  await edit(page, 0, 'income', '');
  assert.ok((await bals(page)).every(Number.isFinite));
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});

test('BR_010 · TC-TBL-013/014: กรอกรายรับในแถวที่มีรายจ่าย → รายจ่ายเป็น 0 (B รับ 400 คงเหลือ 1,900) · กรอกรายจ่ายในแถวที่มีรายรับ → รายรับเป็น 0 (A จ่าย 100 คงเหลือ 900)', o, async () => {
  const page = await open({ state: { ...T3, settings: { type: 'other', opening: 1000 } } });
  await row(page, 1).locator('[data-f=income]').fill('400');
  let r = (await table(page))[1];
  assert.deepEqual([r.income, r.expense, r.bal], [400, 0, 1900]);
  assert.equal(await row(page, 1).locator('[data-f=expense]').inputValue(), '');
  await row(page, 0).locator('[data-f=expense]').fill('100');
  r = (await table(page))[0];
  assert.deepEqual([r.income, r.expense, r.bal], [0, 100, 900]);
  await K.closeAll(page);
});

test('FR_TBL_050 · FR_TBL_070 · FR_STO_010 · TC-TBL-016/017/018/023/024: ลบแถวกลาง คงเหลือและสรุปใหม่ · ลบจนว่างไม่ error · แถวที่ลบไม่กลับมาหลังรีโหลด · สรุป 4 ค่าอัปเดตทันที', o, async () => {
  const page = await open({ state: T3 });
  assert.deepEqual(await sum4(page), ['800.00', '200.00', '1,600.00', '3']);
  await edit(page, 1, 'expense', 700);
  assert.deepEqual(await sum4(page), ['800.00', '700.00', '1,100.00', '3']);
  await row(page, 0).locator('.del').click();
  assert.deepEqual(await sum4(page), ['300.00', '700.00', '600.00', '2']);
  await page.locator('#btn-add').click();
  await edit(page, 2, 'date', '2026-03-20'); await row(page, 2).locator('[data-f=income]').fill('50');
  assert.deepEqual(await sum4(page), ['350.00', '700.00', '650.00', '3']);
  await page.reload();
  assert.equal((await table(page)).length, 3);
  await page.locator('#rows tr .del').first().click(); await page.locator('#rows tr .del').first().click(); await page.locator('#rows tr .del').first().click();
  assert.equal((await table(page)).length, 0);
  assert.deepEqual((await sum4(page)).slice(0, 2).concat((await sum4(page))[3]), ['0.00', '0.00', '0']);
  assert.equal(await page.locator('#empty').isVisible(), true);
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
  const p = await open({ state: T3 });
  await row(p, 1).locator('.del').click();
  assert.deepEqual(await bals(p), [1500, 1800]);
  assert.deepEqual(await sum4(p), ['800.00', '0.00', '1,800.00', '2']);
  await K.closeAll(p);
});

test('FR_TBL_060 · BR_030 · TC-TBL-019/020/021/022/003: เพิ่มรายการเองในวันหยุดได้ · วันที่ว่างไม่รับ · นอกช่วงรับ · วันเดียวกันคงลำดับเดิม', o, async () => {
  const page = await open({ state: A });
  const rows = await gen(page);
  assert.equal(rows.filter((r) => r.date === '2026-03-08').length, 0);
  await page.locator('#btn-add').click();
  const last = (await table(page)).length - 1;
  await edit(page, last, 'date', '2026-03-08');
  const i = (await table(page)).findIndex((r) => r.name === 'รายการใหม่');
  await row(page, i).locator('[data-f=expense]').fill('150');
  assert.ok((await table(page)).some((r) => r.date === '2026-03-08' && r.expense === 150), 'วันหยุดเพิ่มเองได้');
  const dateBox = row(page, i).locator('[data-f=date]');
  const had = await dateBox.inputValue();
  await dateBox.fill('').catch(() => {}); await dateBox.evaluate((e) => { e.value = ''; e.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await dateBox.inputValue(), had, 'วันที่ว่าง ไม่รับ คืนค่าเดิม');
  assert.match(await toast(page), /วันที่/);
  await edit(page, i, 'date', '2026-06-01');
  assert.equal((await table(page)).at(-1).date, '2026-06-01', 'นอกช่วงก็เรียงต่อท้ายและรับ');
  await K.closeAll(page);
  const p = await open({ state: { settings: { type: 'other', opening: 0 }, plan: planA, nextId: 4, rows: ['P', 'Q', 'R'].map((n, k) => ({ id: k + 1, date: '2026-03-02', name: n, income: 100, expense: 0 })) } });
  await edit(p, 1, 'income', 60);
  assert.deepEqual((await table(p)).map((r) => r.name), ['P', 'Q', 'R']);
  await p.locator('#btn-add').click();
  assert.deepEqual((await table(p)).map((r) => r.name), ['P', 'Q', 'R', 'รายการใหม่']);
  await K.closeAll(p);
});

test('FR_TBL_070 · TC-TBL-025: ตารางว่างเริ่มต้น สรุปเป็นศูนย์ มีข้อความนำทางให้เลือกประเภทธุรกิจ', o, async () => {
  const page = await open();
  assert.deepEqual(await sum4(page), ['0.00', '0.00', '0.00', '0']);
  assert.match(await page.locator('#empty').innerText(), /เลือกประเภทธุรกิจ/);
  await K.closeAll(page);
});

/* ---------- ส่งออก Excel ---------- */
async function exportXlsx(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.locator('#btn-export').click()]);
  const tmp = await dl.path();
  const b64 = fs.readFileSync(tmp).toString('base64');
  const sheet = await page.evaluate((b) => {
    const wb = XLSX.read(b, { type: 'base64', cellFormula: true, cellNF: true, cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const out = {};
    for (const [k, c] of Object.entries(ws)) if (k[0] !== "!") out[k] = { t: c.t, v: c.v, f: c.f, z: c.z };
    return { cells: out, ref: ws['!ref'] };
  }, b64);
  return { name: dl.suggestedFilename(), ...sheet };
}

test('FR_EXP_010/020/030 · TC-EXP-001..007/010/012/013/014: ไฟล์ .xlsx เปิดได้ หัวคอลัมน์ 5 อัน แถวยอดยกมา คงเหลือเป็นสูตร แถวรวม SUM ชื่อไฟล์ตามช่วงแถว ชื่อ = + @ เป็นข้อความ ตัวเลข/วันที่เป็นชนิดจริง', o, async () => {
  const page = await open({ state: T3 });
  const x = await exportXlsx(page);
  assert.equal(x.name, 'income-expense-2026-03-02_2026-03-04.xlsx');
  assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1'].map((k) => x.cells[k].v), ['วันที่', 'รายการ', 'รายรับ', 'รายจ่าย', 'คงเหลือ']);
  assert.equal(x.cells.B2.v, 'ยอดยกมา');
  assert.equal(x.cells.E2.v, 1000);
  assert.deepEqual(['E3', 'E4', 'E5'].map((k) => x.cells[k].v), [1500, 1300, 1600]);
  assert.deepEqual(['E3', 'E4', 'E5'].map((k) => x.cells[k].f), ['E2+C3-D3', 'E3+C4-D4', 'E4+C5-D5']);
  assert.deepEqual([x.cells.C6.v, x.cells.C6.f, x.cells.D6.v, x.cells.D6.f, x.cells.E6.v], [800, 'SUM(C3:C5)', 200, 'SUM(D3:D5)', 1600]);
  assert.equal(x.cells.B6.v, 'รวม');
  assert.ok(x.cells.C3.t === 'n' && x.cells.A3.t === 'n' && /yy/.test(x.cells.A3.z), 'ตัวเลขและวันที่เป็นชนิดจริง');
  await K.closeAll(page);
  const p = await open({ state: { settings: { type: 'other' }, plan: planA, nextId: 4, rows: ['=1+1', '+SUM(A1)', '@x', '-5', 'ขาย 🍜 "พิเศษ" <b>', 'ไทย'].map((n, k) => ({ id: k + 1, date: '2026-03-0' + (k + 1), name: n, income: 10, expense: 0 })) } });
  const y = await exportXlsx(p);
  assert.equal(y.cells.E2.f, '0+C2-D2');
  assert.deepEqual(['B2', 'B3', 'B4', 'B5', 'B6', 'B7'].map((k) => [y.cells[k].t, y.cells[k].v, y.cells[k].f]), [['s', '=1+1', undefined], ['s', '+SUM(A1)', undefined], ['s', '@x', undefined], ['s', '-5', undefined], ['s', 'ขาย 🍜 "พิเศษ" <b>', undefined], ['s', 'ไทย', undefined]]);
  assert.equal(y.cells.B1.v, 'รายการ');
  assert.equal(y.cells.A8, undefined);
  await K.closeAll(p);
});

test('FR_EXP_010 · FR_EXP_020 · TC-EXP-004/008/011/028: ยอดยกมา 0 ไม่มีแถวยอดยกมา · ส่งออกตารางว่างปุ่มปิด · ชื่อไฟล์ช่วง 1 วัน และข้ามปีมี 0 นำหน้า · หัวคอลัมน์ไม่ปนคำอธิบาย', o, async () => {
  const page = await open({ state: { settings: { type: 'other', opening: 0 }, plan: planA, nextId: 2, rows: [{ id: 1, date: '2026-03-02', name: 'A', income: 500, expense: 0 }] } });
  const x = await exportXlsx(page);
  assert.equal(x.cells.B2.v, 'A');
  assert.equal(x.cells.E2.v, 500);
  assert.equal(x.name, 'income-expense-2026-03-02_2026-03-02.xlsx');
  assert.ok(!JSON.stringify(x.cells).includes('วัน-เดือน-ปี') && !JSON.stringify(x.cells).includes('เงินเข้า'));
  await K.closeAll(page);
  const p = await open({ state: { settings: { type: 'other' }, plan: planA, nextId: 3, rows: [{ id: 1, date: '2026-12-31', name: 'A', income: 5, expense: 0 }, { id: 2, date: '2027-01-01', name: 'B', income: 5, expense: 0 }] } });
  assert.equal((await exportXlsx(p)).name, 'income-expense-2026-12-31_2027-01-01.xlsx');
  await K.closeAll(p);
  const e = await open();
  assert.equal(await e.locator('#btn-export').isDisabled(), true);
  await K.closeAll(e);
});

test('FR_EXP_030 · NFR_PERF_010 · TC-EXP-015/PERF-001/006: ช่วง 366 วัน สร้างเสร็จใน 1 วินาที (5 ครั้ง) สุ่มใหม่ใน 1 วินาที · ส่งออกแถวครบ รายรับ = ผลรวมตาราง', o, async () => {
  const page = await open({ state: { settings: { type: 'other', start: '2026-01-01', end: '2027-01-01' }, plan: planA } });
  const times = [];
  for (let k = 0; k < 5; k++) times.push(await page.evaluate(() => { const t = performance.now(); document.getElementById('btn-gen').click(); return performance.now() - t; }));
  assert.ok(Math.max(...times) < 1000, times.join());
  const regen = await page.evaluate(() => { const t = performance.now(); document.getElementById('btn-regen').click(); return performance.now() - t; });
  assert.ok(regen < 1000);
  const rows = await table(page);
  const x = await exportXlsx(page);
  assert.equal(x.name, `income-expense-2026-01-01_${rows.at(-1).date}.xlsx`);
  const lastRow = Number(x.ref.split(':')[1].replace(/\D/g, ''));
  assert.equal(lastRow - 2, rows.length, 'จำนวนแถวข้อมูล + แถวรวม + หัว');
  assert.equal(x.cells['C' + lastRow].v, sumOf(rows, 'income'));
  assert.equal(await page.locator('#s-n').innerText(), String(rows.length));
  await K.closeAll(page);
});

/* ---------- เก็บสถานะ ---------- */
test('FR_STO_010 · TC-STO-001/002/011/012/013 · NFR-PRV: รีโหลดแล้วประเภท หมวด ตั้งค่าใหม่ ตารางกลับมาครบ · แก้ตารางแล้วรีโหลดยังอยู่ · ข้อมูลแชตเก่าถูกทิ้งไม่ย้ายค่า', o, async () => {
  const page = await open({ state: A, ai: K.aiOk(planA) });
  await page.locator('details.adv summary').click();
  await fillNum(page, '#weekendPct', 55); await fillNum(page, '#margin', 20); await page.locator('#seed').fill('xyz');
  await page.locator('#season [data-m="7"]').click();
  await gen(page);
  await edit(page, 0, 'name', 'แก้แล้ว');
  const before = await table(page);
  await page.reload();
  assert.deepEqual(await table(page), before);
  const st = await state(page);
  assert.deepEqual([st.settings.type, st.settings.weekendPct, st.settings.margin, st.settings.seed, st.settings.season[7]], ['other', 55, 20, 'xyz', 'peak']);
  assert.deepEqual(await names(page, 'rev'), ['ขายหน้าร้าน', 'เดลิเวอรี']);
  await page.reload();
  assert.ok(!('chat' in (await state(page))));
  await K.closeAll(page);
  const old = await open({ state: { ...A, chat: [{ role: 'user', text: 'ข้อความแชตเก่า' }] } });
  await old.locator('#types [data-type=coffee]').click(); // ให้แอปบันทึกใหม่อีกครั้ง
  assert.equal('chat' in (await state(old)), false, 'D-09 ทิ้งแชตเก่าตอนโหลด ไม่ย้ายค่า');
  assert.ok(!JSON.stringify(await state(old)).includes('ข้อความแชตเก่า'));
  assert.ok(!(await old.content()).includes('ข้อความแชตเก่า'));
  await K.closeAll(old);
});

test('NFR_REL_010 · TC-STO-007/008/009: ข้อมูลในเบราว์เซอร์เสีย (JSON เสีย) แอปยังเปิด ใช้ค่าตั้งต้น · เขียนไม่ได้ไม่พัง · ข้อมูล 366 วันเก็บและโหลดกลับได้', o, async () => {
  const ctx = await K.boot();
  const context = await ctx.browser.newContext();
  const page = await context.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('iegen.v1', '{ไม่ใช่ json'));
  await page.goto(ctx.base + '/');
  assert.equal(await page.locator('#types .chip').count(), 9);
  assert.deepEqual(errs, []);
  await context.close();
  const ctx2 = await ctx.browser.newContext();
  const p2 = await ctx2.newPage();
  const errs2 = []; p2.on('pageerror', (e) => errs2.push(String(e)));
  await p2.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await p2.goto(ctx.base + '/');
  await p2.locator('#types [data-type=coffee]').click();
  await p2.locator('#btn-gen').click();
  assert.ok((await table(p2)).length > 0);
  assert.deepEqual(errs2, []);
  await ctx2.close();
  const big = await open({ state: { settings: { type: 'other', start: '2026-01-01', end: '2027-01-01' }, plan: planA } });
  const rows = await gen(big);
  await big.reload();
  assert.deepEqual(await table(big), rows);
  await K.closeAll(big);
});

/* ---------- ความปลอดภัยหน้าจอ ---------- */
const XSS = '<img src=x onerror="window.__x=1">';
test('NFR_SEC_020 · TC-SEC-014/016/020/021: ชื่อที่เป็น HTML (จากผู้ใช้ จาก AI จากช่องพิมพ์) แสดงเป็นข้อความ ไม่ถูกรัน ทั้งก่อนและหลังรีโหลด และส่งออกเป็นข้อความ', o, async () => {
  const ai = K.aiOk({ revenue: [{ name: XSS, weight: 1 }], expenses: [{ name: '<script>window.__x=2</script>', pct: 5, freq: 'daily' }] });
  const page = await open({ state: { ...A, settings: { type: 'other', biz: '<b>ตัวหนา</b><script>window.__w=1</script>' } }, ai });
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.match(await page.locator('#ai-note').innerText(), /ปรับหมวดให้แล้ว/);
  const n = await names(page, 'rev');
  assert.ok(!/[<>]/.test(n[0]));
  await page.locator('#biz').fill(XSS);
  await prowName(page).fill(XSS);
  await gen(page);
  await edit(page, 0, 'name', XSS);
  await page.reload();
  const t = await table(page);
  assert.equal(t[0].name, XSS, 'เก็บและแสดงเป็นข้อความ ไม่ถูกแปลง');
  assert.equal(await page.evaluate(() => window.__x), undefined);
  assert.equal(await page.evaluate(() => window.__w), undefined);
  assert.equal(await page.locator('#rows img, #rev-list img, #ai-note img, #toast img').count(), 0);
  const x = await exportXlsx(page);
  assert.equal(x.cells.B2.v, XSS);
  assert.equal(x.cells.B2.t, 's');
  await K.closeAll(page);
});
const prowName = (page) => page.locator('#rev-list .prow:not(.head) [data-f=name]').first();

test('NFR_PRV_010 · TC-PRV-002/003: สุ่มใหม่ แก้ ลบ เพิ่ม ส่งออก ไม่เรียก /api/plan · ทุกคำขอไป 127.0.0.1 หรือฟอนต์/ไลบรารีที่ประกาศ ไม่ส่งข้อมูลผู้ใช้ออก', o, async () => {
  const page = await open({ state: A, ai: K.aiOk(planA) });
  const reqs = [];
  page.on('request', (r) => reqs.push(r));
  await gen(page);
  await page.locator('#btn-regen').click();
  await edit(page, 0, 'income', 5); await row(page, 1).locator('.del').click(); await page.locator('#btn-add').click();
  await exportXlsx(page);
  await page.reload();
  assert.equal(page.aiCalls.length, 0);
  const external = reqs.map((r) => new URL(r.url())).filter((u) => !['127.0.0.1', 'localhost'].includes(u.hostname));
  assert.ok(external.every((u) => ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'].includes(u.hostname)), external.map((u) => u.href).join());
  assert.ok(reqs.filter((r) => r.method() !== 'GET').length === 0, 'ไม่มีคำขอที่ส่งข้อมูลออก');
  await K.closeAll(page);
});

/* ---------- ใช้งาน / ความเชื่อถือได้ ---------- */
test('NFR_USE_010 · TC-USE-002/003/011/012/013 · TC-GEN-046: มือถือ ≤ 860 px สลับแท็บ ตั้งค่า/ตาราง ไม่มีแถบเลื่อนแนวนอน · หน้าแรกแท็บตั้งค่า มีรายการแล้วเปิดตาราง · จุดเปลี่ยน 860/861 · สร้างสำเร็จสลับไปแท็บตารางเอง', o, async () => {
  for (const w of [360, 361, 390, 860]) {
    const page = await open({ width: w, height: 800 });
    assert.equal(await page.locator('.app').getAttribute('data-view'), 'settings', String(w));
    assert.equal(await page.locator('.tabs').isVisible(), true, String(w));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `ไม่มีแถบเลื่อนแนวนอนที่ ${w}`);
    await K.closeAll(page);
  }
  const wide = await open({ width: 861, height: 800 });
  assert.equal(await wide.locator('.tabs').isVisible(), false);
  assert.equal(await wide.locator('.ledger').isVisible() && await wide.locator('.side').isVisible(), true);
  await K.closeAll(wide);
  const m = await open({ width: 390, height: 800, state: A });
  await m.locator('#btn-gen').click();
  assert.equal(await m.locator('.app').getAttribute('data-view'), 'ledger');
  assert.ok(await m.locator('#tbl').isVisible());
  await m.reload();
  assert.equal(await m.locator('.app').getAttribute('data-view'), 'ledger', 'มีรายการแล้วเปิดแท็บตาราง');
  await m.locator('.tabs [data-tab=settings]').click();
  await m.locator('#start').fill('');
  await m.locator('#btn-gen').click();
  assert.equal(await m.locator('.app').getAttribute('data-view'), 'settings', 'ไม่สำเร็จอยู่แท็บตั้งค่า');
  await K.closeAll(m);
  const d = await open({ width: 1280, height: 800, state: A });
  await d.locator('#btn-gen').click();
  assert.ok(await d.locator('#tbl').isVisible() && await d.locator('.side').isVisible());
  const [sideBox, ledgerBox, btnBox] = await Promise.all([d.locator('.side').boundingBox(), d.locator('.ledger').boundingBox(), d.locator('#btn-gen').boundingBox()]);
  assert.ok(ledgerBox.x < sideBox.x, 'ตารางซ้าย ตั้งค่าขวา');
  assert.ok(sideBox.width >= 380 && sideBox.width <= 430, String(sideBox.width));
  assert.ok(btnBox.x >= sideBox.x, '"สร้างรายการ" อยู่ในแผงตั้งค่า');
  const barBtns = await d.$$eval('.bar .btn', (els) => els.map((e) => e.textContent));
  assert.deepEqual(barBtns, ['สุ่มใหม่', 'ย้อนกลับ', 'เพิ่มรายการ', 'ส่งออก Excel']);
  await K.closeAll(d);
});

test('NFR_USE_010 · TC-USE-005/006: โหมดสว่าง/มืด สลับได้ ธีมคงอยู่หลังรีโหลด · ข้อความในหน้าเป็นภาษาไทย', o, async () => {
  const page = await open();
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.locator('#btn-theme').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.notEqual(await bg(), light);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const text = await page.evaluate(() => document.body.innerText);
  assert.ok(/ประเภทธุรกิจ/.test(text) && /สร้างรายการ/.test(text));
  await K.closeAll(page);
});

test('NFR_REL_010 · TC-REL-004/005: ออฟไลน์หลังโหลดหน้า ใช้ตารางและสร้างรายการได้ ปุ่ม AI แจ้งติดต่อเซิร์ฟเวอร์ไม่ได้ · รีโหลดระหว่างรอ AI ข้อมูลเดิมอยู่ ปุ่มไม่ค้าง', o, async () => {
  const page = await open({ state: { ...A, settings: { type: 'other', biz: 'ร้านทดสอบ' }, rows: T3.rows, nextId: 4 } });
  await page.context().setOffline(true);
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.match(await page.locator('#ai-note').innerText(), /ติดต่อเซิร์ฟเวอร์ไม่ได้/);
  assert.deepEqual((await table(page)).map((r) => r.name), ['A', 'B', 'C']);
  await edit(page, 1, 'expense', 700);
  assert.ok((await bals(page)).every(Number.isFinite));
  assert.ok((await gen(page)).length > 0);
  await page.context().setOffline(false);
  await K.closeAll(page);
  const p = await open({ state: { ...A, settings: { type: 'other', biz: 'ร้านทดสอบ' }, rows: T3.rows, nextId: 4 }, ai: async (route) => { await new Promise((r) => setTimeout(r, 3000)); await K.aiOk(planA)(route).catch(() => {}); } });
  await p.locator('#btn-ai').click();
  await p.reload();
  assert.equal(await p.locator('#btn-ai').isDisabled(), false);
  assert.deepEqual((await table(p)).map((r) => r.name), ['A', 'B', 'C']);
  assert.deepEqual(await names(p, 'rev'), ['ขายหน้าร้าน', 'เดลิเวอรี']);
  await K.closeAll(p);
});

test('NFR_PERF_020 · TC-PERF-005: ระหว่างรอ AI ปุ่มแสดงสถานะ กดซ้ำไม่ได้ และหน้ายังตอบสนอง (แท็บ ธีม แก้ตาราง ใช้ได้)', o, async () => {
  const page = await open({ state: { ...A, settings: { type: 'other', biz: 'ร้านทดสอบ' }, rows: T3.rows, nextId: 4 }, ai: async (route) => { await new Promise((r) => setTimeout(r, 1500)); await K.aiOk(planA)(route); } });
  await page.locator('#btn-ai').click();
  assert.match(await page.locator('#btn-ai').innerText(), /กำลัง/);
  await page.locator('#btn-theme').click();
  await edit(page, 1, 'expense', 650);
  assert.equal((await table(page))[1].expense, 650);
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal((await table(page))[1].expense, 650, 'การแก้ระหว่างรอไม่หาย');
  await K.closeAll(page);
});
