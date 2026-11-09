/* login บนเบราว์เซอร์จริง (เสริมจาก app-hist.test.js): คีย์บอร์ด · คุกกี้ · API ตรง ๆ · เว็บอื่นสั่งไม่ได้ · จอมือถือ · ออกจากระบบ · ล็อกเมื่อรหัสผิด */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const K = require('../test-kit/e2e-kit.js');

const o = { skip: K.skip, timeout: 90000 };
const salt = crypto.randomBytes(16);
Object.assign(process.env, {
  IEGEN_LOGIN_USER: 'admin', IEGEN_LOGIN_PASSWORD_HASH: `scrypt:${salt.toString('hex')}:${crypto.scryptSync('pw-e2e', salt, 64).toString('hex')}`, IEGEN_SESSION_SECRET: 'e'.repeat(40),
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'iegen-login-e2e-')),
});
for (const k of ['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']) delete process.env[k];
test.after(() => K.shutdown());

const login = async (page, pass, user = 'admin') => { await page.fill('#login-user', user); await page.fill('#login-pass', pass); await page.click('#login-btn'); };
const enter = async (page) => { await login(page, 'pw-e2e'); await page.locator('#login').waitFor({ state: 'hidden' }); };

test('คีย์บอร์ด: โฟกัสเริ่มที่ช่องชื่อ · กด Enter ในช่องรหัสส่งฟอร์ม · Tab วนอยู่ในหน้า login ไม่หลุดไปแอปด้านหลัง', o, async () => {
  const page = await K.open();
  await page.locator('#login').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'login-user');
  await page.keyboard.type('admin'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'login-pass');
  // Tab ออกไปแถบของเบราว์เซอร์ได้ (activeElement เป็น BODY) แต่ห้ามเข้าไปในแอปด้านหลัง
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('body > header, body > nav, body > main')), false, `Tab ครั้งที่ ${i + 1} โฟกัสเข้าแอปด้านหลัง`);
  }
  await page.fill('#login-pass', 'pw-e2e'); await page.press('#login-pass', 'Enter');
  await page.locator('#login').waitFor({ state: 'hidden' });
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});

test('คุกกี้: JavaScript ในหน้าอ่านไม่ได้ · เซิร์ฟเวอร์ตั้ง HttpOnly + SameSite=Lax · รหัสผ่านไม่ค้างในช่องหลังเข้าได้ · ไม่มีอะไรใน localStorage', o, async () => {
  const page = await K.open();
  await enter(page);
  assert.equal(await page.evaluate(() => document.cookie.includes('iegen_session')), false);
  const c = (await page.context().cookies()).find((x) => x.name === 'iegen_session');
  assert.ok(c, 'ไม่มีคุกกี้เซสชัน');
  assert.deepEqual([c.httpOnly, c.sameSite, c.path], [true, 'Lax', '/']);
  assert.equal(c.expires, -1, 'ไม่ติ๊กจำไว้ = คุกกี้เซสชัน');
  assert.equal(await page.inputValue('#login-pass'), '');
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('pw-e2e')), false);
  await K.closeAll(page);
});

test('API ตรง ๆ: ไม่มีคุกกี้ → 401 ทั้ง /api/session /api/ledgers /api/plan · login แล้วคำขอชุดเดียวกันผ่าน', o, async () => {
  const page = await K.open();
  const r = page.context().request;
  const get = async (p) => (await r.get(page.base + p)).status();
  for (const p of ['/api/session', '/api/ledgers']) assert.equal(await get(p), 401, p);
  assert.equal((await r.post(page.base + '/api/plan', { data: { text: 'x' } })).status(), 401);
  await enter(page);
  assert.equal(await get('/api/session'), 200);
  assert.equal(await get('/api/ledgers'), 200);
  await K.closeAll(page);
});

test('เว็บอื่นสั่งไม่ได้: POST /api/login ที่มี Origin ต่างโฮสต์ → 403 และไม่ได้คุกกี้', o, async () => {
  const page = await K.open();
  const res = await page.context().request.post(page.base + '/api/login', { headers: { Origin: 'https://evil.example' }, data: { user: 'admin', password: 'pw-e2e' } });
  assert.equal(res.status(), 403);
  assert.equal((await page.context().cookies()).some((x) => x.name === 'iegen_session'), false);
  await K.closeAll(page);
});

test('จอมือถือ 375: การ์ด login อยู่ในจอ ไม่เลื่อนข้าง ปุ่มกดได้ แล้วเข้าใช้งานได้', o, async () => {
  const page = await K.open({ width: 375, height: 667 });
  await page.locator('#login').waitFor();
  const m = await page.evaluate(() => {
    const b = document.getElementById('login-btn').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth, btnIn: b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, btnH: b.height };
  });
  assert.deepEqual([m.overflow, m.btnIn], [false, true]);
  assert.ok(m.btnH >= 44, `ปุ่มสูง ${m.btnH}px น้อยกว่า 44`);
  await enter(page);
  assert.deepEqual(page.errors, []);
  await K.closeAll(page);
});

test('ออกจากระบบ: ปุ่มโผล่เฉพาะหลัง login · กดแล้วคุกกี้ใช้ไม่ได้อีก (API 401) · รีโหลดเจอหน้า login', o, async () => {
  const page = await K.open();
  assert.equal(await page.locator('#btn-logout').isHidden(), true);
  await enter(page);
  await page.locator('#btn-logout').click();
  await page.locator('#login').waitFor();
  assert.equal((await page.context().request.get(page.base + '/api/ledgers')).status(), 401);
  await page.reload();
  await page.locator('#login').waitFor();
  assert.equal(await page.locator('#btn-logout').isHidden(), true);
  await K.closeAll(page);
});

// ต้องอยู่ท้ายไฟล์: ผิดครบแล้วทั้งเซิร์ฟเวอร์ (ทุกบริบทใช้ IP 127.0.0.1) จะถูกล็อก 15 นาที
test('ใส่รหัสผิด 5 ครั้ง → ครั้งที่ 6 แม้รหัสถูกก็เข้าไม่ได้ (429) และหน้าจอแจ้งข้อความที่ต่างจากรหัสผิด', o, async () => {
  const page = await K.open();
  await page.locator('#login').waitFor();
  for (let i = 0; i < 5; i++) {
    const [res] = await Promise.all([page.waitForResponse('**/api/login'), login(page, 'wrong-' + i)]);
    assert.equal(res.status(), 401);
    await page.locator('#login-err', { hasText: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }).waitFor();
  }
  const [res] = await Promise.all([page.waitForResponse('**/api/login'), login(page, 'pw-e2e')]);
  assert.equal(res.status(), 429);
  const msg = await page.locator('#login-err').innerText();
  assert.ok(msg && !msg.includes('ไม่ถูกต้อง'), `ข้อความตอนถูกล็อก: "${msg}"`);
  assert.equal(await page.locator('#login').isVisible(), true);
  await K.closeAll(page);
});
