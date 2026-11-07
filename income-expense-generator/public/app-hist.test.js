/* หน้า login และหน้าต่างประวัติบนหน้าจริง: ใส่รหัส → บันทึก → ล้างตาราง → เปิดชุดเดิมกลับมา → ลบ (เซิร์ฟเวอร์จริง ฐานข้อมูลในโฟลเดอร์ชั่วคราว ไม่ต่อ B2) */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const K = require('../test-kit/e2e-kit.js');

const { skip, open, table, planA } = K;
const o = { skip, timeout: 90000 };
// ต้องตั้งก่อน open() ครั้งแรก เพราะเซิร์ฟเวอร์อ่านค่าตอนโหลด
const salt = crypto.randomBytes(16);
Object.assign(process.env, {
  IEGEN_LOGIN_USER: 'admin', IEGEN_LOGIN_PASSWORD_HASH: `scrypt:${salt.toString('hex')}:${crypto.scryptSync('pw-e2e', salt, 64).toString('hex')}`, IEGEN_SESSION_SECRET: 'e'.repeat(40),
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'iegen-e2e-')),
});
for (const k of ['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']) delete process.env[k];
test.after(() => K.shutdown());

const T2 = { settings: { type: 'other' }, plan: planA, nextId: 3, rows: [
  { id: 1, date: '2026-03-02', name: 'ขายหน้าร้าน', income: 500, expense: 0 }, { id: 2, date: '2026-03-03', name: 'วัตถุดิบ', income: 0, expense: 200 }] };

/** ผ่านหน้า login ด้วยรหัสที่ให้มา */
const login = async (page, pass, user = 'admin') => { await page.fill('#login-user', user); await page.fill('#login-pass', pass); await page.click('#login-btn'); };

test('หน้า login: เปิดมาเจอหน้า login · แอปด้านหลังกดไม่ได้ · รหัสผิดแจ้งเตือน · รหัสถูกเข้าได้ · รีโหลดแล้วไม่ถามซ้ำ · ออกจากระบบกลับมาหน้า login', o, async () => {
  const page = await open({ state: T2 });
  await page.locator('#login').waitFor();
  assert.equal(await page.locator('#login-err').isHidden(), true, 'เข้าครั้งแรกยังไม่ขึ้นข้อความผิด');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'login-user');
  assert.equal(await page.locator('main.app').evaluate((el) => el.inert), true, 'แอปด้านหลังต้องถูกปิดกั้น');

  await login(page, 'wrong');
  await page.locator('#login-err', { hasText: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }).waitFor();
  await login(page, 'pw-e2e', 'someone-else');
  await page.locator('#login-err', { hasText: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }).waitFor();
  assert.equal(await page.locator('#login').isVisible(), true);

  await page.fill('#login-pass', ''); await page.click('#login-btn');
  await page.locator('#login-err', { hasText: 'ใส่ชื่อผู้ใช้และรหัสผ่านให้ครบ' }).waitFor();

  await page.click('#login-eye');
  assert.equal(await page.locator('#login-pass').getAttribute('type'), 'text');
  await page.click('#login-eye');
  assert.equal(await page.locator('#login-pass').getAttribute('type'), 'password');

  await login(page, 'pw-e2e');
  await page.locator('#login').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('main.app').evaluate((el) => el.inert), false);
  assert.equal(await page.locator('#btn-logout').isVisible(), true);

  const cookie = (await page.context().cookies()).find((c) => c.name === 'iegen_session');
  assert.deepEqual([cookie.httpOnly, cookie.sameSite, cookie.expires], [true, 'Lax', -1], 'ไม่ติ๊กจำไว้ = คุกกี้เซสชัน หายเมื่อปิดเบราว์เซอร์');
  assert.equal(await page.evaluate(() => localStorage.getItem('iegen.pass')), null, 'หน้าเว็บไม่เก็บรหัสไว้เอง');
  await page.reload();
  await page.locator('#btn-logout').waitFor();
  assert.equal(await page.locator('#login').isHidden(), true, 'มีคุกกี้แล้ว ไม่ถามซ้ำ');

  await page.click('#btn-logout');
  await page.locator('#login').waitFor();
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});

test('หน้า login: ติ๊กจำไว้ได้คุกกี้ 30 วัน · คุกกี้หายระหว่างใช้งาน (เซสชันหมดอายุ) → กลับหน้า login', o, async () => {
  const page = await open({ state: T2 });
  await page.check('#login-remember');
  await login(page, 'pw-e2e');
  await page.locator('#login').waitFor({ state: 'hidden' });
  const days = ((await page.context().cookies()).find((c) => c.name === 'iegen_session').expires * 1000 - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days < 30.1, 'อายุคุกกี้ ' + days);
  await page.context().clearCookies();
  await page.click('#btn-hist');
  await page.locator('#login-err', { hasText: 'ต้องเข้าสู่ระบบก่อน' }).waitFor();
  assert.equal(await page.locator('#hist').isVisible(), false, 'หน้าต่างประวัติต้องปิด');
  await K.closeAll(page);
});

test('ประวัติ: บันทึกแล้วเห็นในรายการ · ล้างตารางแล้วเปิดชุดเดิมกลับมาได้ครบ · ลบต้องกด 2 ครั้ง', o, async () => {
  const page = await open({ state: T2 });
  const before = await table(page);
  await login(page, 'pw-e2e');
  await page.locator('#login').waitFor({ state: 'hidden' });
  await page.click('#btn-hist');
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
