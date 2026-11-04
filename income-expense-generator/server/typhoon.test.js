/* ตัวเชื่อม Typhoon (FR-BIZ-030/040 · NFR-PERF-020 · NFR-PRV-010) — stub เฉพาะ global fetch (ของข้างนอก) ไม่เรียก Typhoon จริง */
const test = require('node:test');
const assert = require('node:assert/strict');
const { requestPlan, extractJson } = require('./typhoon.js');

const cfg = { apiKey: 'tk-TEST-1234567890', baseUrl: 'http://stub.invalid/v1', model: 'm-test' };
const planA = { settings: { monthlyRevenueMin: 50000, monthlyRevenueMax: 60000 }, revenue: [{ name: 'หมวดของ AI', weight: 10 }], expenses: [{ name: 'ค่าของ AI', pct: 40, freq: 'weekly' }] };
const reply = (obj, ok = true, status = 200) => ({ ok, status, json: async () => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] }) });

const realFetch = global.fetch;
let calls;
function stub(fn) { calls = []; global.fetch = async (url, init) => { calls.push({ url, init }); return fn(calls.length, url, init); }; }
test.afterEach(() => { global.fetch = realFetch; });

test('FR-BIZ-040: ไม่มีคีย์ → ไม่เรียก Typhoon · source=fallback พร้อมเหตุผล', async () => {
  stub(() => reply(planA));
  const r = await requestPlan({ ...cfg, apiKey: '' }, 'ร้านกาแฟ', '2026-11-04');
  assert.equal(calls.length, 0);
  assert.equal(r.source, 'fallback');
  assert.match(r.note, /คีย์/);
});

test('FR-BIZ-030: สำเร็จ → source=typhoon · แผนผ่าน sanitize · settings ผ่าน sanitizeSettings', async () => {
  stub(() => reply(planA));
  const r = await requestPlan(cfg, 'ร้านกาแฟ รายรับเดือนละ 50,000-60,000', '2026-11-04');
  assert.equal(r.source, 'typhoon');
  assert.equal(r.plan.revenue[0].name, 'หมวดของ AI');
  assert.deepEqual(r.settings, { monthMin: 50000, monthMax: 60000 });
  assert.equal(calls.length, 1);
});

test('BIZ-036: ส่งไปที่ baseUrl/chat/completions ด้วยโมเดลและคีย์จาก cfg', async () => {
  stub(() => reply(planA));
  await requestPlan({ ...cfg, model: 'typhoon-custom' }, 'ร้านกาแฟ', '2026-11-04');
  assert.equal(calls[0].url, 'http://stub.invalid/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].init.body).model, 'typhoon-custom');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tk-TEST-1234567890');
});

test('NFR-PRV-010 / TC-PRV-001: เนื้อคำขอมีแค่คำสั่งระบบ วันที่ และข้อความประเภทธุรกิจ', async () => {
  stub(() => reply(planA));
  await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04');
  const user = JSON.parse(calls[0].init.body).messages.find((m) => m.role === 'user').content;
  assert.equal(user, 'วันนี้คือ 2026-11-04\nธุรกิจ: ร้านกาแฟ');
  assert.ok(!JSON.stringify(calls[0].init.body).includes('tk-TEST'), 'คีย์ต้องอยู่ในหัว Authorization เท่านั้น ไม่อยู่ในเนื้อ');
});

test('FR-BIZ-040: ตอบไม่ใช่ JSON 2 ครั้ง → เรียก 2 ครั้งเท่านั้น แล้ว fallback', async () => {
  stub(() => reply('ขอโทษ ตอบไม่ได้'));
  const r = await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04');
  assert.equal(calls.length, 2);
  assert.equal(r.source, 'fallback');
});

test('FR-BIZ-040: ไม่ใช่ JSON ครั้งแรก ครั้งที่ 2 ถูก → ใช้แผนจาก AI', async () => {
  stub((n) => (n === 1 ? reply('???') : reply(planA)));
  const r = await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04');
  assert.equal(calls.length, 2);
  assert.equal(r.source, 'typhoon');
});

test('BIZ-032: JSON ที่ห่อด้วย code fence ใช้ได้', async () => {
  stub(() => reply('```json\n' + JSON.stringify(planA) + '\n```'));
  assert.equal((await requestPlan(cfg, 'x', '2026-11-04')).source, 'typhoon');
  assert.equal(extractJson('ไม่มีวงเล็บ'), null);
});

test('FR-BIZ-040: HTTP 500 หรือเชื่อมต่อไม่ได้ → fallback ไม่โยน error', async () => {
  stub(() => reply({}, false, 500));
  assert.equal((await requestPlan(cfg, 'x', '2026-11-04')).source, 'fallback');
  stub(() => { throw new TypeError('fetch failed'); });
  const r = await requestPlan(cfg, 'x', '2026-11-04');
  assert.equal(r.source, 'fallback');
  assert.match(r.note, /เชื่อมต่อ/);
});

test('SEC-013: JSON ถูกต้องแต่รูปร่างผิด ({} [] null "text" ฯลฯ) → fallback ทุกแบบ', async () => {
  for (const bad of ['{}', '[]', 'null', '"text"', '{"incomeCategories":5}', '{"revenue":[],"expenses":[]}']) {
    stub(() => reply(bad));
    assert.equal((await requestPlan(cfg, 'x', '2026-11-04')).source, 'fallback', bad);
  }
});

test('NFR-PERF-020: ตอบช้าเกิน 40 วินาที → ยกเลิกคำขอ แล้ว fallback พร้อมเหตุผลหมดเวลา', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  stub((n, url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const p = requestPlan(cfg, 'x', '2026-11-04');
  t.mock.timers.tick(39999);
  await Promise.resolve();
  assert.equal(calls[0].init.signal.aborted, false, 'ที่ 39.999 วินาทียังไม่หมดเวลา');
  t.mock.timers.tick(1);
  const r = await p;
  assert.equal(r.source, 'fallback');
  assert.match(r.note, /40 วินาที/);
  assert.equal(calls.length, 1, 'หมดเวลาไม่ลองซ้ำ');
});

test('NFR-PERF-020: ตอบที่ 39 วินาที ยังใช้แผนจาก AI', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let release;
  stub(() => new Promise((res) => { release = () => res(reply(planA)); }));
  const p = requestPlan(cfg, 'x', '2026-11-04');
  t.mock.timers.tick(39000);
  release();
  assert.equal((await p).source, 'typhoon');
});

test('FR-BIZ-050: ผู้ใช้ไม่ได้ระบุตัวเลข → ทิ้งช่วงรายรับที่ AI คิดเอง (ไม่ทับค่าตั้งต้นของประเภท)', async () => {
  stub(() => reply(planA));
  const r = await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04');
  assert.equal(r.source, 'typhoon');
  assert.deepEqual(r.settings, {});
});

test('BR-060: AI ตอบรายจ่ายรวมเกิน 90% → ย่อสัดส่วนเหลือ 85% · ไม่เกินไม่แตะ', async () => {
  const big = { ...planA, expenses: [{ name: 'a', pct: 60, freq: 'weekly' }, { name: 'b', pct: 40, freq: 'monthly', day: 1 }] }; // รวม 100
  stub(() => reply(big));
  const r = await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04');
  const sum = r.plan.expenses.reduce((a, e) => a + e.pct, 0);
  assert.ok(Math.abs(sum - 85) < 0.5, String(sum));
  assert.deepEqual(r.plan.expenses.map((e) => e.pct), [51, 34]);
  stub(() => reply(planA)); // 40% เดิม
  assert.equal((await requestPlan(cfg, 'ร้านกาแฟ', '2026-11-04')).plan.expenses[0].pct, 40);
});
