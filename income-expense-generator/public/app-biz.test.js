/* ประเภทธุรกิจ · หมวด · ปุ่ม "ให้ AI ปรับหมวด" (FR-BIZ-010..060 · FR-GEN-080 · NFR-REL-010) — เปิดหน้าจริง Typhoon จำลองด้วย page.route */
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../test-kit/e2e-kit.js');
const { PRESETS } = require('./presets.js');

const { skip, open, state, toast, table, sumOf, gen, fillNum, prow, names, planA } = K;
const o = { skip, timeout: 60000 };
test.after(() => K.shutdown());
const chip = (page, id) => page.locator(`#types [data-type=${id}]`);
const T0 = [{ id: 1, date: '2026-03-02', name: 'A', income: 500, expense: 0 }, { id: 2, date: '2026-03-03', name: 'B', income: 0, expense: 700 }, { id: 3, date: '2026-03-04', name: 'C', income: 300, expense: 0 }];

test('FR_BIZ_010 · TC-BIZ-001: ชิป 8 ประเภท + "อื่น ๆ (พิมพ์เอง)" · ยังไม่เลือกไม่เห็นปุ่ม AI และช่องพิมพ์ · เลือกแล้วเห็นปุ่ม AI ไม่เห็นช่องพิมพ์', o, async () => {
  const page = await open();
  const labels = await page.$$eval('#types .chip', (els) => els.map((e) => e.textContent));
  assert.deepEqual(labels, [...PRESETS.map((p) => p.label), 'อื่น ๆ (พิมพ์เอง)']);
  assert.equal(await page.locator('#btn-ai').isVisible(), false);
  assert.equal(await page.locator('#biz').isVisible(), false);
  await chip(page, 'coffee').click();
  assert.equal(await page.locator('#types [aria-pressed=true]').count(), 1);
  assert.equal(await page.locator('#btn-ai').isVisible(), true);
  assert.equal(await page.locator('#biz').isVisible(), false);
  await K.closeAll(page);
});

test('FR_BIZ_010 · TC-BIZ-002/003: เลือกประเภทสำเร็จรูป → หมวดและช่วงรายรับถูกแทนที่ · ตารางไม่เปลี่ยน · ข้อความสั้น · ทุก 8 ประเภทสร้างรายการได้', o, async () => {
  const page = await open({ state: { settings: { monthMin: 1, monthMax: 2, dayMin: 1, dayMax: 2 } } });
  await chip(page, 'coffee').click();
  const p = PRESETS.find((x) => x.id === 'coffee');
  assert.deepEqual(await names(page, 'rev'), p.revenue.map((r) => r.name));
  assert.deepEqual(await names(page, 'exp'), p.expenses.map((e) => e.name));
  assert.match(await toast(page), /ร้านกาแฟ/);
  assert.equal(await page.locator('#mmin').inputValue(), String(p.income.monthMin));
  assert.equal(await page.locator('#mmax').inputValue(), String(p.income.monthMax));
  await page.locator('#mode [data-mode=day]').click();
  assert.equal(await page.locator('#dmin').inputValue(), String(p.income.dayMin));
  assert.equal((await table(page)).length, 0);
  for (const x of PRESETS) {
    await chip(page, x.id).click();
    assert.equal(await page.locator('#rev-list .prow:not(.head)').count(), x.revenue.length, x.id);
    assert.equal(await page.locator('#exp-list .prow:not(.head)').count(), x.expenses.length, x.id);
    const rows = await gen(page);
    assert.ok(rows.length > 0 && rows.every((r) => Number.isFinite(r.income) && Number.isFinite(r.bal)), x.id);
  }
  await K.closeAll(page);
});

test('FR_BIZ_010 · D-03 · TC-BIZ-004: เปลี่ยนประเภทแทนที่หมวดทั้งชุดโดยไม่ถาม (ไม่มี dialog) แจ้งข้อความสั้น และคงอยู่หลังรีโหลด', o, async () => {
  const page = await open();
  let dialogs = 0; page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await chip(page, 'coffee').click();
  await prow(page, 'rev', 0).locator('[data-f=name]').fill('หมวดของฉัน');
  await page.locator('#btn-exp-add').click();
  await chip(page, 'garage').click();
  assert.equal(dialogs, 0);
  assert.match(await toast(page), /อู่ซ่อมรถ/);
  const g = PRESETS.find((x) => x.id === 'garage');
  assert.deepEqual(await names(page, 'rev'), g.revenue.map((r) => r.name));
  assert.deepEqual(await names(page, 'exp'), g.expenses.map((e) => e.name));
  await page.reload();
  assert.deepEqual(await names(page, 'exp'), g.expenses.map((e) => e.name));
  await K.closeAll(page);
});

test('FR_BIZ_010 · FR_BIZ_060 · D-05 · TC-BIZ-005/006: "อื่น ๆ" ตอนยังไม่มีหมวด ได้หมวดกลาง 65% + ช่องพิมพ์ + โฟกัส · ตอนมีหมวดแล้วคงเดิม · กลับประเภทสำเร็จรูปช่องพิมพ์หาย', o, async () => {
  const page = await open();
  await chip(page, 'other').click();
  const st = await state(page);
  assert.equal(st.plan.expenses.reduce((a, e) => a + e.pct, 0), 65);
  assert.equal(await page.locator('#biz').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'biz');
  assert.equal(await page.locator('#btn-ai').isVisible(), true);
  assert.ok((await gen(page)).length > 0, 'สร้างได้โดยไม่พิมพ์อะไร');
  await chip(page, 'coffee').click();
  await prow(page, 'rev', 0).locator('[data-f=name]').fill('หมวดของฉัน');
  await chip(page, 'other').click();
  assert.equal((await names(page, 'rev'))[0], 'หมวดของฉัน');
  assert.equal(await page.locator('#biz').isVisible(), true);
  await chip(page, 'coffee').click();
  assert.equal(await page.locator('#biz').isVisible(), false);
  assert.notEqual((await names(page, 'rev'))[0], 'หมวดของฉัน');
  await K.closeAll(page);
});

test('FR_BIZ_010 · FR_GEN_080 · TC-BIZ-007: ยังไม่เลือกประเภท กด "สร้างรายการ" ไม่ได้ แจ้งให้เลือก ไม่เรียก AI · เลือกแล้วผ่าน · ล้างทั้งหมดแล้วต้องเลือกใหม่', o, async () => {
  const page = await open({ ai: K.aiOk(planA) });
  await page.locator('#btn-gen').click();
  assert.match(await toast(page), /เลือกประเภทธุรกิจก่อน/);
  assert.equal((await table(page)).length, 0);
  assert.equal(page.aiCalls.length, 0);
  await chip(page, 'coffee').click();
  assert.ok((await gen(page)).length > 0);
  await page.locator('#btn-clear').click(); await page.locator('#btn-clear').click();
  await page.locator('#btn-gen').click();
  assert.match(await toast(page), /เลือกประเภทธุรกิจก่อน/);
  assert.equal((await table(page)).length, 0);
  await K.closeAll(page);
});

const A_STATE = { settings: { type: 'other' }, plan: planA };
test('FR_BIZ_010 · NFR_PRV_010 · TC-BIZ-008: เลือกประเภทแล้วสร้างรายการได้โดยไม่เรียก Typhoon', o, async () => {
  const page = await open({ ai: K.aiOk(planA), state: A_STATE });
  const rows = await gen(page);
  assert.equal(page.aiCalls.length, 0);
  assert.equal(sumOf(rows, 'income'), 90000);
  await K.closeAll(page);
});

test('FR_BIZ_020 · TC-BIZ-009: แก้ชื่อหมวดรายรับ/รายจ่าย → ชื่อใหม่อยู่ในตาราง ชื่อเดิมหาย ยอดรวมเท่าเดิม (90,000 / 63,000)', o, async () => {
  const page = await open({ state: A_STATE });
  await prow(page, 'rev', 0).locator('[data-f=name]').fill('ขายสด');
  await prow(page, 'exp', 3).locator('[data-f=name]').fill('ไฟฟ้า');
  const rows = await gen(page);
  assert.ok(rows.filter((r) => r.income).every((r) => ['ขายสด', 'เดลิเวอรี'].includes(r.name)));
  assert.deepEqual(rows.filter((r) => r.name === 'ไฟฟ้า').map((r) => r.expense), [4500]);
  assert.equal(rows.filter((r) => ['ขายหน้าร้าน', 'ค่าไฟ'].includes(r.name)).length, 0);
  assert.equal(sumOf(rows, 'income'), 90000);
  assert.equal(sumOf(rows, 'expense'), 63000);
  await K.closeAll(page);
});

test('FR_BIZ_020 · TC-BIZ-010: เปลี่ยนความถี่ → ช่องวันที่หายเฉพาะไม่ใช่รายเดือน · % 10 วันที่ 10 → ค่าเช่า 9,000 ลง 2026-03-10 รวม 54,000', o, async () => {
  const page = await open({ state: A_STATE });
  const rent = prow(page, 'exp', 2);
  await rent.locator('[data-f=freq]').selectOption('weekly');
  assert.equal(await rent.locator('[data-f=day]').count(), 0);
  await rent.locator('[data-f=freq]').selectOption('monthly');
  assert.equal(await rent.locator('[data-f=day]').count(), 1);
  const day = Number(await rent.locator('[data-f=day]').inputValue());
  assert.ok(day >= 1 && day <= 28);
  await fillNum(page, '#exp-list .prow:not(.head):nth-of-type(4) [data-f=pct]', 10);
  await fillNum(page, '#exp-list .prow:not(.head):nth-of-type(4) [data-f=day]', 10);
  const rows = await gen(page);
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าเช่า').map((r) => [r.date, r.expense]), [['2026-03-10', 9000]]);
  assert.equal(sumOf(rows, 'expense'), 54000);
  await K.closeAll(page);
});

test('FR_BIZ_020 · TC-BIZ-011: เพิ่ม/ลบหมวด และจำนวนหมวดคงอยู่หลังรีโหลด · เพิ่มแล้วโฟกัสที่ช่องชื่อ', o, async () => {
  const page = await open({ state: A_STATE });
  await page.locator('#btn-rev-add').click();
  assert.equal(await page.evaluate(() => document.activeElement.dataset.f), 'name');
  await page.locator('#btn-exp-add').click();
  assert.deepEqual([(await names(page, 'rev')).length, (await names(page, 'exp')).length], [3, 6]);
  await page.reload();
  assert.deepEqual([(await names(page, 'rev')).length, (await names(page, 'exp')).length], [3, 6]);
  await prow(page, 'rev', 2).locator('.rm').click();
  await prow(page, 'exp', 5).locator('.rm').click();
  assert.deepEqual([(await names(page, 'rev')).length, (await names(page, 'exp')).length], [2, 5]);
  await K.closeAll(page);
});

test('BR_060 · TC-BIZ-012..015: เพดานหมวด รายรับ 5 · รายวัน 2 · รายสัปดาห์ 3 · รายเดือน 8 — ถึงเพดานเพิ่มไม่ได้และแจ้ง', o, async () => {
  const page = await open({ state: A_STATE });
  await page.locator('#btn-rev-add').click(); await page.locator('#btn-rev-add').click(); // 2 → 4 → ... ต้องถึง 5 ที่ครั้งที่ 3
  assert.equal((await names(page, 'rev')).length, 4);
  await page.locator('#btn-rev-add').click();
  assert.equal((await names(page, 'rev')).length, 5);
  await page.locator('#btn-rev-add').click();
  assert.equal((await names(page, 'rev')).length, 5);
  assert.match(await toast(page), /ไม่เกิน 5/);
  // รายจ่าย: แผน A มี รายวัน 1 · สัปดาห์ 1 · เดือน 3 รวม 5 → เพิ่มจนเต็มทั้งหมด (2 + 3 + 8 = 13)
  for (let i = 0; i < 8; i++) await page.locator('#btn-exp-add').click();
  assert.equal((await names(page, 'exp')).length, 13);
  const freqs = await page.$$eval('#exp-list [data-f=freq]', (els) => els.map((e) => e.value));
  const count = (f) => freqs.filter((x) => x === f).length;
  assert.deepEqual([count('daily'), count('weekly'), count('monthly')], [2, 3, 8]);
  await page.locator('#btn-exp-add').click();
  assert.equal((await names(page, 'exp')).length, 13);
  assert.match(await toast(page), /เต็มแล้ว/);
  // เปลี่ยนความถี่ไปหมวดที่เต็มแล้วไม่ได้ (รายวันเต็ม 2)
  await prow(page, 'exp', 1).locator('[data-f=freq]').selectOption('daily');
  assert.match(await toast(page), /เต็มแล้ว/);
  await K.closeAll(page);
});

test('BR_060 · TC-BIZ-016/SEC: ชื่อหมวดรับได้ 40 ตัว ตัวที่ 41 ไม่ถูกรับ (ช่องรายรับและรายจ่าย)', o, async () => {
  const page = await open({ state: A_STATE });
  for (const [kind, sel] of [['rev', 0], ['exp', 0]]) {
    const input = prow(page, kind, sel).locator('[data-f=name]');
    await input.fill('ก'.repeat(41));
    assert.equal((await input.inputValue()).length, 40);
    await input.fill('ก'.repeat(39));
    assert.equal((await input.inputValue()).length, 39);
  }
  await K.closeAll(page);
});

test('FR_BIZ_020 · D-04 D-06 · TC-BIZ-017: % ค่าแรง −1 → 0 (ช่องปรับเป็น 0) · 0 ไม่มีรายการ รวม 54,000 · 60 → ค่าแรง 54,000 รวม 108,000 · 61 → 60', o, async () => {
  const page = await open({ state: A_STATE });
  const pct = '#exp-list .prow:not(.head):nth-of-type(6) [data-f=pct]';
  await fillNum(page, pct, -1);
  assert.equal(await page.locator(pct).inputValue(), '0');
  let rows = await gen(page);
  assert.equal(rows.filter((r) => r.name === 'ค่าแรง').length, 0);
  assert.equal(sumOf(rows, 'expense'), 54000);
  assert.ok(rows.every((r) => r.income >= 0 && r.expense >= 0));
  await fillNum(page, pct, 60);
  rows = await gen(page);
  assert.equal(sumOf(rows, 'expense', (r) => r.name === 'ค่าแรง'), 54000);
  assert.equal(sumOf(rows, 'expense'), 108000);
  await fillNum(page, pct, 61);
  assert.equal(await page.locator(pct).inputValue(), '60');
  await K.closeAll(page);
});

test('FR_BIZ_020 · D-06 · BR_030 · TC-BIZ-018: วันที่จ่าย 0 → 1 · 1 ลงตรงวันอาทิตย์ 1 มี.ค. ไม่เลื่อน (D-01) · 28 · 29 → 28', o, async () => {
  const page = await open({ state: A_STATE });
  const day = '#exp-list .prow:not(.head):nth-of-type(4) [data-f=day]';
  await fillNum(page, day, 0);
  assert.equal(await page.locator(day).inputValue(), '1');
  let rows = await gen(page);
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าเช่า').map((r) => [r.date, r.expense]), [['2026-03-01', 18000]]);
  assert.equal(rows.filter((r) => r.date === '2026-03-01').length, 1 + 0, 'มีเฉพาะรายเดือน ไม่มีรายรับ');
  await fillNum(page, day, 28);
  rows = await gen(page);
  assert.deepEqual(rows.filter((r) => r.name === 'ค่าเช่า').map((r) => r.date), ['2026-03-28']);
  await fillNum(page, day, 29);
  assert.equal(await page.locator(day).inputValue(), '28');
  await K.closeAll(page);
});

test('FR_BIZ_020 · FR_GEN_080 · TC-BIZ-019/020: ชื่อว่างถูกตัดก่อนสร้าง (รายรับ 90,000 รายจ่าย 58,500) · ต้องเหลือ 1 รายรับกับ 1 รายจ่าย ไม่งั้นไม่สร้างและตารางเดิมไม่เปลี่ยน', o, async () => {
  const page = await open({ state: A_STATE });
  await prow(page, 'rev', 1).locator('[data-f=name]').fill('');
  await prow(page, 'exp', 3).locator('[data-f=name]').fill('');
  let rows = await gen(page);
  assert.deepEqual([...new Set(rows.filter((r) => r.income).map((r) => r.name))], ['ขายหน้าร้าน']);
  assert.equal(rows.filter((r) => r.name === 'ค่าไฟ').length, 0);
  assert.deepEqual([(await names(page, 'rev')).length, (await names(page, 'exp')).length], [1, 4], 'ไม่เหลือแถวหมวดที่ชื่อว่าง');
  assert.equal(sumOf(rows, 'income'), 90000);
  assert.equal(sumOf(rows, 'expense'), 58500);
  // ลบหมวดรายรับทั้งหมด
  const before = await table(page);
  await prow(page, 'rev', 0).locator('.rm').click();
  await page.locator('#btn-gen').click();
  assert.match(await toast(page), /อย่างน้อย 1 หมวดรายรับ/);
  assert.deepEqual(await table(page), before);
  await page.locator('#btn-rev-add').click();
  await prow(page, 'rev', 0).locator('[data-f=name]').fill('ขายสด');
  while (await page.locator('#exp-list .rm').count()) await page.locator('#exp-list .rm').first().click();
  await page.locator('#btn-gen').click();
  assert.match(await toast(page), /อย่างน้อย 1 หมวดรายรับและ 1 หมวดรายจ่าย/);
  await page.locator('#btn-exp-add').click();
  await prow(page, 'exp', 0).locator('[data-f=name]').fill('ค่าของ');
  await prow(page, 'exp', 0).locator('[data-f=pct]').fill('10');
  await prow(page, 'exp', 0).locator('[data-f=day]').fill('5');
  rows = await gen(page);
  assert.equal(sumOf(rows, 'income'), 90000);
  assert.equal(sumOf(rows, 'expense'), 9000);
  await K.closeAll(page);
});

test('FR_BIZ_020 · TC-BIZ-021: สัดส่วนรายรับ 90:10 หมวดที่สัดส่วนมากมีแถวมากกว่า · สลับสัดส่วนผลกลับกัน · รายรับรวมเท่าเดิม', o, async () => {
  const page = await open({ state: A_STATE });
  const share = async (a, b) => {
    await fillNum(page, '#rev-list .prow:not(.head):nth-of-type(2) [data-f=weight]', a);
    await fillNum(page, '#rev-list .prow:not(.head):nth-of-type(3) [data-f=weight]', b);
  };
  const count = (rows, n) => rows.filter((r) => r.income && r.name === n).length;
  await page.locator('#types [data-type=other]').click(); // ยังมีหมวดเดิม (คงไว้)
  await page.locator('details.adv summary').click();
  await fillNum(page, '#txMin', 4);
  await fillNum(page, '#txMax', 4);
  await share(90, 10);
  const rows = await gen(page);
  assert.ok(count(rows, 'ขายหน้าร้าน') > count(rows, 'เดลิเวอรี'));
  assert.equal(sumOf(rows, 'income'), 90000);
  await share(10, 90);
  const swapped = await gen(page);
  assert.ok(count(swapped, 'ขายหน้าร้าน') < count(swapped, 'เดลิเวอรี'));
  await K.closeAll(page);
});

const okPlan = { revenue: [{ name: 'ขายหน้าร้าน', weight: 60 }, { name: 'เดลิเวอรี', weight: 40 }], expenses: planA.expenses };
const MINE = { settings: { type: 'coffee' }, plan: { revenue: [{ name: 'หมวดของฉัน', weight: 50 }, { name: 'ขายสด', weight: 50 }], expenses: [{ name: 'ค่าของฉัน', pct: 7, freq: 'weekly' }] }, rows: T0, nextId: 4 };

test('FR_BIZ_030 · TC-BIZ-022: AI ตอบแผนปกติ → หมวดถูกแทนที่ทั้งชุด · ข้อความใต้ปุ่ม · ตารางไม่เปลี่ยนจนกด "สร้างรายการ" (รายรับ 90,000 รายจ่าย 63,000)', o, async () => {
  const page = await open({ ai: async (route) => { await new Promise((r) => setTimeout(r, 300)); await K.aiOk(okPlan)(route); }, state: { ...MINE } });
  await page.locator('#btn-ai').click();
  assert.equal(await page.locator('#btn-ai').isDisabled(), true);
  assert.match(await page.locator('#btn-ai').innerText(), /กำลัง/);
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.match(await page.locator('#ai-note').innerText(), /AI ปรับหมวดให้แล้ว/);
  assert.deepEqual(await names(page, 'rev'), ['ขายหน้าร้าน', 'เดลิเวอรี']);
  assert.deepEqual(await names(page, 'exp'), ['วัตถุดิบ', 'ค่าขนส่ง', 'ค่าเช่า', 'ค่าไฟ', 'ค่าแรง']);
  assert.deepEqual((await table(page)).map((r) => r.name), ['A', 'B', 'C']);
  const rows = await gen(page);
  assert.equal(sumOf(rows, 'income'), 90000);
  assert.equal(sumOf(rows, 'expense'), 63000);
  assert.equal(page.aiCalls.length, 1);
  await K.closeAll(page);
});

test('FR_BIZ_030 · NFR_PRV_010 · TC-BIZ-023: ประเภทสำเร็จรูปส่งชื่อประเภท · "อื่น ๆ" ส่งข้อความที่พิมพ์ · ไม่ส่งตัวเลข/รายการในตาราง', o, async () => {
  const page = await open({ ai: K.aiOk(okPlan), state: { settings: { type: 'coffee', opening: 12345 }, plan: MINE.plan, rows: [{ id: 1, date: '2026-03-02', name: 'รายการลับ77700', income: 77700, expense: 0 }], nextId: 2 } });
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(page.aiCalls[0].text, 'ร้านกาแฟ');
  const body = JSON.stringify(page.aiCalls[0]);
  for (const bad of ['12345', '77700', 'รายการลับ', 'หมวดของฉัน']) assert.ok(!body.includes(bad), bad);
  await chip(page, 'other').click();
  await page.locator('#biz').fill('ร้านซ่อมนาฬิกา');
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(page.aiCalls[1].text, 'ร้านซ่อมนาฬิกา');
  await K.closeAll(page);
});

test('FR_BIZ_030 · FR_BIZ_060 · TC-BIZ-024/025: "อื่น ๆ" ช่องว่าง/เว้นวรรค กด AI ไม่เรียก แจ้งให้พิมพ์ โฟกัสช่อง · พิมพ์แล้วเรียก 1 ครั้ง · ยังไม่เลือกประเภทไม่เห็นปุ่ม', o, async () => {
  const page = await open({ ai: K.aiOk(okPlan) });
  assert.equal(await page.locator('#btn-ai').isVisible(), false);
  await chip(page, 'other').click();
  const before = await names(page, 'exp');
  await page.locator('#btn-ai').click();
  assert.equal(page.aiCalls.length, 0);
  assert.match(await toast(page), /พิมพ์ประเภทธุรกิจ/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'biz');
  await page.locator('#biz').fill('     ');
  await page.locator('#btn-ai').click();
  assert.equal(page.aiCalls.length, 0);
  assert.deepEqual(await names(page, 'exp'), before);
  await page.locator('#biz').fill('ร้านซ่อมนาฬิกา');
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(page.aiCalls.length, 1);
  assert.deepEqual(await names(page, 'exp'), ['วัตถุดิบ', 'ค่าขนส่ง', 'ค่าเช่า', 'ค่าไฟ', 'ค่าแรง']);
  await page.locator('#btn-clear').click(); await page.locator('#btn-clear').click();
  assert.equal(await page.locator('#btn-ai').isVisible(), false);
  await K.closeAll(page);
});

test('FR_BIZ_030 · TC-BIZ-026: กดปุ่ม AI ซ้ำ 3 ครั้งระหว่างรอ → ส่งคำขอเดียว', o, async () => {
  const page = await open({ ai: async (route) => { await new Promise((r) => setTimeout(r, 600)); await K.aiOk(okPlan)(route); } });
  await chip(page, 'coffee').click();
  const b = page.locator('#btn-ai');
  await b.click(); await b.click({ force: true, timeout: 500 }).catch(() => {}); await b.dispatchEvent('click');
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(page.aiCalls.length, 1);
  await K.closeAll(page);
});

const failCases = [
  ['TC-BIZ-027 ไม่มีคีย์', K.aiFail('ยังไม่ได้ตั้งคีย์ Typhoon จึงใช้แม่แบบกลาง'), /คีย์/],
  ['TC-BIZ-028 Typhoon ล่ม', K.aiFail('เชื่อมต่อ Typhoon ไม่ได้ จึงใช้แม่แบบกลาง'), /เชื่อมต่อ/],
  ['TC-BIZ-029 หมดเวลา', K.aiFail('Typhoon ตอบช้าเกิน 40 วินาที จึงใช้แม่แบบกลาง'), /40 วินาที/],
  ['TC-BIZ-030 ตอบไม่ใช่ JSON', K.aiFail('Typhoon ตอบรูปแบบที่ใช้ไม่ได้ จึงใช้แม่แบบกลาง'), /รูปแบบ/],
  ['TC-BIZ-033 เซิร์ฟเวอร์หยุด', (route) => route.abort('connectionrefused'), /ติดต่อเซิร์ฟเวอร์ไม่ได้/],
  ['TC-REL-002 เซิร์ฟเวอร์ตอบ 500', (route) => route.fulfill({ status: 500, body: 'x' }), /ไม่สำเร็จ/],
  ['TC-SEC-013 JSON รูปร่างผิดที่เซิร์ฟเวอร์ปล่อยมา', (route) => route.fulfill({ json: { source: 'typhoon', plan: { incomeCategories: 5 } } }), /ใช้ไม่ได้/],
];
for (const [name, handler, note] of failCases) {
  test(`FR_BIZ_040 · NFR_REL_010 · ${name}: คงหมวดเดิม (ไม่ใช้หมวดกลางทับ) แสดงเหตุผลใต้ปุ่ม ตารางเดิมไม่เปลี่ยน แก้หมวดและสร้างรายการต่อได้`, o, async () => {
    const page = await open({ ai: handler, state: { ...MINE } });
    await page.locator('#btn-ai').click();
    await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
    assert.match(await page.locator('#ai-note').innerText(), note);
    assert.match(await page.locator('#ai-note').innerText(), /คงหมวดเดิม/);
    assert.deepEqual(await names(page, 'rev'), ['หมวดของฉัน', 'ขายสด']);
    assert.equal(await prow(page, 'exp', 0).locator('[data-f=pct]').inputValue(), '7');
    assert.deepEqual((await table(page)).map((r) => [r.name, r.bal]), [['A', 500], ['B', -200], ['C', 100]]);
    const rows = await gen(page);
    assert.ok(rows.length > 0 && rows.every((r) => ['หมวดของฉัน', 'ขายสด', 'ค่าของฉัน'].includes(r.name)));
    await page.locator('#btn-undo').click();
    assert.deepEqual((await table(page)).map((r) => r.name), ['A', 'B', 'C'], 'ย้อนกลับคืนตารางเดิม');
    await page.reload();
    assert.deepEqual(await names(page, 'rev'), ['หมวดของฉัน', 'ขายสด']);
    await K.closeAll(page);
  });
}

test('FR_BIZ_040 · TC-BIZ-031: ตอบผิดครั้งแรก ครั้งที่สองถูก (เซิร์ฟเวอร์ลองซ้ำเอง) → ได้แผนจาก AI', o, async () => {
  const page = await open({ ai: K.aiOk(okPlan) });
  await chip(page, 'coffee').click();
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.deepEqual(await names(page, 'rev'), ['ขายหน้าร้าน', 'เดลิเวอรี']);
  await K.closeAll(page);
});

test('FR_BIZ_050 · TC-BIZ-037: AI ส่งรายรับค่าเดียวพร้อมช่วงวันที่ → ช่องตั้งค่าเติม · สลับเป็นโหมดรายเดือน · สร้างแล้วเดือนละ 120,000 รวม 360,000', o, async () => {
  const page = await open({ ai: K.aiOk(okPlan, { monthMin: 120000, monthMax: 120000, startDate: '2026-03-01', endDate: '2026-05-31' }), state: { settings: { mode: 'day', type: 'coffee' }, plan: MINE.plan } });
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(await page.locator('#start').inputValue(), '2026-03-01');
  assert.equal(await page.locator('#end').inputValue(), '2026-05-31');
  assert.equal(await page.locator('#mode [data-mode=month]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual([await page.locator('#mmin').inputValue(), await page.locator('#mmax').inputValue()], ['120000', '120000']);
  const rows = await gen(page);
  const m = (p) => sumOf(rows, 'income', (r) => r.date.startsWith(p));
  assert.deepEqual([m('2026-03'), m('2026-04'), m('2026-05')], [120000, 120000, 120000]);
  await K.closeAll(page);
});

test('FR_BIZ_050 · TC-BIZ-040/041/042/043/044: ส่งเฉพาะรายรับ → วันที่ไม่เปลี่ยน · เฉพาะวันที่ → รายรับไม่เปลี่ยน · ไม่ส่ง → คงเดิม · ช่วง 400 วัน/เริ่ม>สิ้นสุดไม่ถูกเติม · ไม่มี AI ไม่เติม', o, async () => {
  const cases = [
    [{ monthMin: 50000, monthMax: 50000 }, ['2026-03-01', '2026-03-31', '50000', '50000']],
    [{ startDate: '2026-03-01', endDate: '2026-05-31' }, ['2026-03-01', '2026-05-31', '90000', '90000']],
    [{}, ['2026-03-01', '2026-03-31', '90000', '90000']],
    [{ startDate: '2026-01-01', endDate: '2027-02-04' }, ['2026-03-01', '2026-03-31', '90000', '90000']],
    [{ startDate: '2026-03-31', endDate: '2026-03-01' }, ['2026-03-01', '2026-03-31', '90000', '90000']],
    [{ monthMin: -1, monthMax: -1 }, ['2026-03-01', '2026-03-31', '90000', '90000']],
  ];
  for (const [settings, want] of cases) {
    const page = await open({ ai: K.aiOk(okPlan, settings), state: { ...A_STATE, settings: { type: 'coffee' } } });
    await page.locator('#btn-ai').click();
    await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
    const got = [await page.locator('#start').inputValue(), await page.locator('#end').inputValue(), await page.locator('#mmin').inputValue(), await page.locator('#mmax').inputValue()];
    assert.deepEqual(got, want, JSON.stringify(settings));
    await K.closeAll(page);
  }
  const page = await open({ ai: K.aiFail('ใช้ไม่ได้'), state: { ...A_STATE, settings: { type: 'coffee' } } });
  await page.locator('#btn-ai').click();
  await page.waitForFunction(() => !document.getElementById('btn-ai').disabled);
  assert.equal(await page.locator('#mmin').inputValue(), '90000');
  await K.closeAll(page);
});

test('FR_BIZ_060 · TC-BIZ-045/046: ช่อง "พิมพ์ประเภทธุรกิจของคุณ" รับ 200 ตัว ตัดที่ 201 · มีเฉพาะ "อื่น ๆ" · ข้อความในช่องไม่กระทบการสร้างรายการ ไม่เรียก AI', o, async () => {
  const page = await open({ ai: K.aiOk(okPlan), state: { settings: { type: 'other', seed: 'r1' }, plan: planA } });
  await chip(page, 'coffee').click();
  assert.equal(await page.locator('#biz').count() && await page.locator('#biz').isVisible(), false);
  assert.equal(await page.getByText('รายละเอียดเพิ่ม').count(), 0);
  await chip(page, 'other').click();
  for (const [n, want] of [[199, 199], [200, 200], [201, 200]]) {
    await page.locator('#biz').fill('ก'.repeat(n));
    assert.equal((await page.locator('#biz').inputValue()).length, want);
  }
  await page.locator('#biz').fill('');
  const r1 = await gen(page);
  await page.locator('#biz').fill('ร้านซ่อมนาฬิกา มีพนักงาน 2 คน');
  const r2 = await gen(page);
  assert.deepEqual(r2.map((r) => [r.date, r.name, r.income, r.expense]), r1.map((r) => [r.date, r.name, r.income, r.expense]));
  assert.equal(page.aiCalls.length, 0);
  await K.closeAll(page);
});
