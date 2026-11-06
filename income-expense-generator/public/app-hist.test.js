/* หน้าต่างประวัติบนหน้าจริง: ใส่รหัส → บันทึก → ล้างตาราง → เปิดชุดเดิมกลับมา → ลบ (เซิร์ฟเวอร์จริง ฐานข้อมูลในโฟลเดอร์ชั่วคราว ไม่ต่อ B2) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const K = require('../test-kit/e2e-kit.js');

const { skip, open, table, planA } = K;
const o = { skip, timeout: 90000 };
// ต้องตั้งก่อน open() ครั้งแรก เพราะเซิร์ฟเวอร์อ่านค่าตอนโหลด
Object.assign(process.env, { APP_PASSWORD: 'pw-e2e', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'iegen-e2e-')) });
for (const k of ['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']) delete process.env[k];
test.after(() => K.shutdown());

const T2 = { settings: { type: 'other' }, plan: planA, nextId: 3, rows: [
  { id: 1, date: '2026-03-02', name: 'ขายหน้าร้าน', income: 500, expense: 0 }, { id: 2, date: '2026-03-03', name: 'วัตถุดิบ', income: 0, expense: 200 }] };

test('ประวัติ: รหัสผิดแจ้งเตือน · บันทึกแล้วเห็นในรายการ · ล้างตารางแล้วเปิดชุดเดิมกลับมาได้ครบ · ลบต้องกด 2 ครั้ง', o, async () => {
  const page = await open({ state: T2 });
  const before = await table(page);
  await page.click('#btn-hist');
  await page.locator('#hist-pass').waitFor();
  assert.equal(await page.locator('#hist-main').isHidden(), true, 'ยังไม่ใส่รหัส ไม่เห็นรายการ');

  await page.fill('#hist-pass', 'wrong'); await page.click('#hist-login-btn');
  await page.locator('#hist-login-err', { hasText: 'รหัสผ่านไม่ถูกต้อง' }).waitFor();

  await page.fill('#hist-pass', 'pw-e2e'); await page.click('#hist-login-btn');
  await page.locator('#hist-empty').waitFor();
  assert.equal(await page.locator('#hist-name').getAttribute('placeholder'), 'รายการ 01/03/2569 – 31/03/2569');

  await page.fill('#hist-name', 'ร้านทดสอบ มี.ค.'); await page.click('#hist-save');
  await page.locator('#hist-note', { hasText: 'บันทึก “ร้านทดสอบ มี.ค.” แล้ว · ยังไม่ได้ตั้งการสำรองไป Backblaze' }).waitFor();
  await page.locator('#hist-list li').first().waitFor();
  assert.match(await page.locator('#hist-list li').first().innerText(), /ร้านทดสอบ มี\.ค\.[\s\S]*01\/03\/2569 – 31\/03\/2569 · 2 รายการ/);
  await page.click('.hist-head button');

  await page.click('#btn-clear'); await page.click('#btn-clear');
  assert.equal((await table(page)).length, 0);

  await page.click('#btn-hist'); // รหัสจำไว้แล้ว เข้ารายการทันที
  await page.locator('#hist-list li button', { hasText: 'เปิด' }).click();
  await page.locator('#hist').waitFor({ state: 'hidden' });
  assert.deepEqual(await table(page), before);

  await page.click('#btn-hist');
  const del = page.locator('#hist-list li button', { hasText: 'ลบ' });
  await del.click();
  assert.equal(await del.innerText(), 'กดอีกครั้งเพื่อลบ');
  assert.equal(await page.locator('#hist-list li').count(), 1, 'กดครั้งแรกยังไม่ลบ');
  await del.click();
  await page.locator('#hist-empty').waitFor();
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});
