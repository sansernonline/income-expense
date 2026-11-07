/* login บัญชีเดียว: แฮชรหัสผ่าน · คุกกี้เซสชัน · ล็อกเมื่อรหัสผิด · อ่านค่าจาก env · สคริปต์ npm run password-hash */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { hashPassword, verifyPassword, loadAuthConfig, createSession, isValidSession, createAuth, COOKIE } = require('./auth.js');

const SECRET = 'k'.repeat(40);
const PW = 'correct horse battery';
const mk = async () => createAuth({ user: 'admin', passwordHash: await hashPassword(PW), secret: SECRET });
const reqWith = (cookie) => ({ headers: cookie ? { cookie } : {} });
const cookieOf = (r) => r.cookie.split(';')[0];

test('แฮชรหัสผ่าน: รูปแบบ scrypt:salt:hash · รหัสถูกผ่าน ผิดไม่ผ่าน · ค่าที่เก็บเสียไม่ throw · ตัวเต็มความกว้างเท่าตัวปกติ', async () => {
  const h = await hashPassword('รหัสลับ-123');
  assert.match(h, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('รหัสลับ-123', h), true);
  assert.equal(await verifyPassword('รหัสลับ-124', h), false);
  for (const bad of ['', 'plain', 'scrypt::', 'bcrypt:aa:bb']) assert.equal(await verifyPassword('x', bad), false);
  assert.equal(await verifyPassword('ｐａｓｓ', await hashPassword('pass')), true);
});

test('อ่านค่าจาก env: ไม่ตั้งเลย = ไม่มี login · ตั้งไม่ครบหรือความลับสั้น = ผิดพร้อมชื่อตัวแปร ไม่บอกค่า', () => {
  assert.equal(loadAuthConfig({}), null);
  assert.throws(() => loadAuthConfig({ IEGEN_LOGIN_USER: 'a' }), /ขาด IEGEN_LOGIN_PASSWORD_HASH และ IEGEN_SESSION_SECRET/);
  assert.throws(() => loadAuthConfig({ IEGEN_LOGIN_USER: 'a', IEGEN_LOGIN_PASSWORD_HASH: 'secret-hash', IEGEN_SESSION_SECRET: 'short' }), (e) => /ยาวอย่างน้อย 32/.test(e.message) && !e.message.includes('secret-hash'));
  assert.deepEqual(loadAuthConfig({ IEGEN_LOGIN_USER: ' a ', IEGEN_LOGIN_PASSWORD_HASH: 'h', IEGEN_SESSION_SECRET: SECRET }), { user: 'a', passwordHash: 'h', secret: SECRET });
});

test('เซสชัน: ลายเซ็นถูกและยังไม่หมดอายุใช้ได้ · แก้ค่า เปลี่ยนความลับ หรือหมดอายุแล้วใช้ไม่ได้', () => {
  const now = 1_000_000;
  const short = createSession(SECRET, false, now), long = createSession(SECRET, true, now);
  assert.equal(short.expiresAt - now, 12 * 3600 * 1000);
  assert.equal(long.expiresAt - now, 30 * 86400 * 1000);
  assert.equal(isValidSession(short.value, SECRET, now + 1), true);
  assert.equal(isValidSession(short.value, SECRET, short.expiresAt + 1), false, 'หมดอายุ');
  assert.equal(isValidSession(short.value, 'z'.repeat(40), now + 1), false, 'เปลี่ยนความลับ = ทุกคนหลุด');
  const parts = long.value.split('.'); parts[1] = String(Number(parts[1]) + 1000);
  assert.equal(isValidSession(parts.join('.'), SECRET, now + 1), false, 'แก้เวลาหมดอายุเอง');
  for (const bad of ['', undefined, 'v1.1.2', 'v2.1.2.3']) assert.equal(isValidSession(bad, SECRET, now), false);
});

test('login: ชื่อหรือรหัสผิดได้ข้อความเดียวกัน · ถูกได้คุกกี้ HttpOnly SameSite=Lax · ติ๊กจำไว้มี Expires · https ใส่ Secure', async () => {
  const a = await mk();
  const wrongUser = await a.login('ip', { user: 'x', password: PW }, false);
  const wrongPass = await a.login('ip', { user: 'admin', password: 'nope' }, false);
  assert.deepEqual([wrongUser.status, wrongPass.status], [401, 401]);
  assert.equal(wrongUser.body.error, wrongPass.body.error);
  assert.equal((await a.login('ip', { user: '', password: '' }, false)).status, 400);
  assert.equal((await a.login('ip', null, false)).status, 400);

  const ok = await a.login('ip', { user: 'admin', password: PW }, false);
  assert.equal(ok.status, 200);
  assert.match(ok.cookie, new RegExp(`^${COOKIE}=v1\\.\\d+\\.[0-9a-f]{32}\\.[0-9a-f]{64}; HttpOnly; SameSite=Lax; Path=/$`));
  const kept = await a.login('ip', { user: 'admin', password: PW, remember: true }, true);
  assert.match(kept.cookie, /; Secure; Expires=/);
  assert.deepEqual(a.session(reqWith(cookieOf(ok))), { status: 200, body: { required: true, user: 'admin' } });
});

test('/api/session กับด่าน /api/plan: ไม่มี login = ผ่านทุกคน · มีแล้วต้องมีคุกกี้ · ยังไม่เข้าระบบไม่นับเป็นรหัสผิด', async () => {
  const off = createAuth(null);
  assert.deepEqual([off.enabled, off.allows(reqWith()), off.session(reqWith()).body.required], [false, true, false]);
  assert.equal((await off.login('ip', { user: 'a', password: 'b' }, false)).status, 404);

  const a = await mk();
  for (let i = 0; i < 30; i++) assert.equal(a.session(reqWith()).status, 401); // เปิดหน้าเว็บซ้ำ ๆ ไม่ถูกล็อก
  assert.equal(a.allows(reqWith()), false);
  const ok = await a.login('ip', { user: 'admin', password: PW }, false);
  assert.equal(a.allows(reqWith(cookieOf(ok))), true);
  assert.equal(a.allows(reqWith(`other=1; ${cookieOf(ok)}`)), true, 'คุกกี้อื่นปนได้');
  assert.equal(a.allows(reqWith(cookieOf(ok)), Date.now() + 13 * 3600 * 1000), false, 'เกิน 12 ชั่วโมงถ้าไม่ติ๊กจำไว้');
});

test('ใส่ผิด 5 ครั้งใน 15 นาที → 429 แม้ครั้งต่อไปใส่ถูก · IP อื่นยังเข้าได้ · ครบ 15 นาทีเข้าได้อีก', async () => {
  const a = await mk(), bad = { user: 'admin', password: 'nope' }, good = { user: 'admin', password: PW };
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) assert.equal((await a.login('1.2.3.4', bad, false, t0 + i)).status, 401);
  assert.equal((await a.login('1.2.3.4', good, false, t0 + 10)).status, 429);
  assert.equal((await a.login('5.6.7.8', good, false, t0 + 10)).status, 200);
  assert.equal((await a.login('1.2.3.4', good, false, t0 + 15 * 60 * 1000 + 10)).status, 200);
});

test('เปลี่ยน IP หนีการล็อกไม่ได้: ผิดรวมทุก IP 50 ครั้ง → 429 ทุก IP', async () => {
  const a = await mk(), t0 = Date.now();
  for (let i = 0; i < 50; i++) assert.equal((await a.login(`10.0.0.${i}`, { user: 'admin', password: 'nope' }, false, t0 + i)).status, 401);
  assert.equal((await a.login('9.9.9.9', { user: 'admin', password: PW }, false, t0 + 100)).status, 429);
});

test('npm run password-hash: รับรหัสทาง stdin พิมพ์ HASH กับ SECRET ที่ server/auth.js ตรวจผ่านได้', async () => {
  const out = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'password-hash.js')]);
    let o = ''; c.stdout.on('data', (d) => (o += d)); c.on('error', reject); c.on('close', (code) => (code === 0 ? resolve(o) : reject(new Error('exit ' + code))));
    c.stdin.end('a-long-test-password\n');
  });
  const hash = out.match(/^IEGEN_LOGIN_PASSWORD_HASH=(.+)$/m)[1];
  assert.match(out, /^IEGEN_SESSION_SECRET=[0-9a-f]{64}$/m);
  assert.equal(await verifyPassword('a-long-test-password', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});
