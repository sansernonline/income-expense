/* ประวัติ /api/ledgers: รหัสผ่าน · บันทึก เปิด ลบ · สำรองไป B2 และดึงกลับตอนเครื่องเริ่มใหม่ (B2 จำลองเป็น http server ในเครื่อง) */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHistory } = require('./history.js');

const USER = 'admin', PASS = 'test-pass-123';
const okAuth = { enabled: true, check: () => true }; // ตัวแทน server/auth.js สำหรับทดสอบประวัติอย่างเดียว
const hashSync = (pw) => { const salt = crypto.randomBytes(16); return `scrypt:${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `iegen-${n}-`));

// B2 จำลอง: จำไฟล์ล่าสุดของแต่ละ path · failGet สั่งให้ GET ล้ม
const b2 = { objects: new Map(), puts: [], failGet: false };
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.method === 'PUT') { b2.objects.set(req.url, Buffer.concat(chunks)); b2.puts.push({ url: req.url, headers: req.headers }); res.writeHead(200); return res.end(); }
    if (b2.failGet) { res.writeHead(500); return res.end(); }
    const obj = b2.objects.get(req.url);
    res.writeHead(obj ? 200 : 404); res.end(obj);
  });
});

let srv, base, b2cfg, cookie;
const origErr = console.error, logs = [];
test.before(async () => {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  b2cfg = { B2_ENDPOINT: `http://127.0.0.1:${mock.address().port}`, B2_REGION: 'us-west-004', B2_BUCKET: 'iegen-test', B2_KEY_ID: 'kid', B2_APPLICATION_KEY: 'appkey' };
  Object.assign(process.env, b2cfg, { IEGEN_LOGIN_USER: USER, IEGEN_LOGIN_PASSWORD_HASH: hashSync(PASS), IEGEN_SESSION_SECRET: 's'.repeat(40), DATA_DIR: tmp('srv') });
  console.error = (...a) => logs.push(a.join(' '));
  const app = require('./server.js');
  srv = app.server;
  await new Promise((r) => app.start(0, r));
  base = `http://127.0.0.1:${srv.address().port}`;
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: USER, password: PASS }) });
  cookie = r.headers.get('set-cookie').split(';')[0];
});
test.after(() => { console.error = origErr; srv.close(); mock.close(); });

const api = (p, { method = 'GET', body, anon = false, headers = {} } = {}) =>
  fetch(base + '/api/ledgers' + p, { method, headers: { 'Content-Type': 'application/json', ...(anon ? {} : { Cookie: cookie }), ...headers }, body: body && JSON.stringify(body) });
const sample = (n = 3) => ({ settings: { start: '2026-01-01', end: '2026-01-31', opening: 0 }, rows: Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-01-02', name: 'ขาย', income: 100, expense: 0 })), plan: null, nextId: n + 1 });

test('ยังไม่ login หรือคุกกี้ปลอม → 401 · คำขอจากเว็บอื่น → 403', async () => {
  assert.equal((await api('', { anon: true })).status, 401);
  assert.equal((await api('', { anon: true, headers: { Cookie: 'iegen_session=v1.9999999999999.aa.bb' } })).status, 401);
  assert.equal((await api('', { headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('บันทึก → อยู่ในรายการ เปิดได้ข้อมูลเดิม และสำรองไฟล์ SQLite ไป B2 พร้อมลายเซ็น v4', async () => {
  const r = await api('', { method: 'POST', body: { name: '  ร้านกาแฟ ม.ค.  ', data: sample() } });
  assert.equal(r.status, 201);
  const { id, backup } = await r.json();
  assert.equal(backup, 'ok');

  const last = b2.puts.at(-1);
  assert.equal(last.url, '/iegen-test/iegen/iegen.sqlite');
  assert.match(last.headers.authorization, /^AWS4-HMAC-SHA256 Credential=kid\/\d{8}\/us-west-004\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(b2.objects.get(last.url).subarray(0, 15).toString(), 'SQLite format 3');

  const list = await (await api('')).json();
  assert.equal(list.backup, 'on');
  const item = list.items.find((x) => x.id === id);
  assert.deepEqual({ ...item, savedAt: typeof item.savedAt }, { id, name: 'ร้านกาแฟ ม.ค.', savedAt: 'string', start: '2026-01-01', end: '2026-01-31', rowCount: 3 });

  const one = await (await api('/' + id)).json();
  assert.deepEqual(one.data, sample());
});

test('ข้อมูลผิดรูป → 400 ไม่บันทึก', async () => {
  const before = (await (await api('')).json()).items.length;
  for (const body of [{ name: '', data: sample() }, { name: 'x'.repeat(101), data: sample() }, { name: 'a', data: { rows: [] } }, { name: 'a', data: { settings: { start: '1/1/2026' }, rows: [] } }, { name: 'a', data: { settings: {}, rows: [1] } }]) {
    assert.equal((await api('', { method: 'POST', body })).status, 400, JSON.stringify(body));
  }
  const bad = await fetch(base + '/api/ledgers', { method: 'POST', headers: { Cookie: cookie }, body: '{not json' });
  assert.equal(bad.status, 400);
  assert.equal((await (await api('')).json()).items.length, before);
});

test('ลบแล้วเปิดไม่ได้ · ลบซ้ำได้ 404 · ที่อยู่แปลกได้ 404', async () => {
  const { id } = await (await api('', { method: 'POST', body: { name: 'ลบทิ้ง', data: sample(1) } })).json();
  assert.equal((await api('/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await api('/' + id)).status, 404);
  assert.equal((await api('/' + id, { method: 'DELETE' })).status, 404);
  assert.equal((await api('/abc')).status, 404);
});

test('เครื่องเริ่มใหม่ไม่มีไฟล์ในเครื่อง → ดึงฐานข้อมูลล่าสุดจาก B2 มาใช้', async () => {
  const h = createHistory({ dataDir: tmp('restore'), auth: okAuth, b2cfg: { base: b2cfg.B2_ENDPOINT, bucket: 'iegen-test', keyId: 'kid', secret: 'appkey', region: 'us-west-004', objectKey: 'iegen/iegen.sqlite' } });
  const r = await h.handle({ method: 'GET', headers: {} }, new URL('http://x/api/ledgers'));
  assert.equal(r.status, 200);
  assert.ok(r.body.items.some((x) => x.name === 'ร้านกาแฟ ม.ค.'));
  await h.close();
});

test('ดึงจาก B2 ไม่สำเร็จ → 503 ไม่เปิดฐานว่าง · B2 กลับมาแล้วใช้ได้', async () => {
  const dir = tmp('fail');
  const h = createHistory({ dataDir: dir, auth: okAuth, b2cfg: { base: b2cfg.B2_ENDPOINT, bucket: 'iegen-test', keyId: 'kid', secret: 'appkey', region: 'us-west-004', objectKey: 'iegen/iegen.sqlite' }, log: () => {} });
  const req = { method: 'GET', headers: {} }, url = new URL('http://x/api/ledgers');
  b2.failGet = true;
  assert.equal((await h.handle(req, url)).status, 503);
  assert.equal(fs.existsSync(path.join(dir, 'iegen.sqlite')), false);
  b2.failGet = false;
  assert.equal((await h.handle(req, url)).status, 200);
  await h.close();
});

test('ไม่ตั้ง login → ประวัติปิด 503 · ตั้งแล้วแต่ยังไม่เข้าระบบ 401', async () => {
  const url = new URL('http://x/api/ledgers');
  const off = createHistory({ dataDir: tmp('off'), auth: { enabled: false, check: () => false }, b2cfg: null });
  assert.equal((await off.handle({ method: 'GET', headers: {} }, url)).status, 503);
  const out = createHistory({ dataDir: tmp('out'), auth: { enabled: true, check: () => false }, b2cfg: null });
  assert.equal((await out.handle({ method: 'GET', headers: {} }, url)).status, 401);
  await out.close();
});

test('ผ่านเซิร์ฟเวอร์จริง: /api/session · /api/login · /api/logout · /api/plan ต้อง login เมื่อตั้ง IEGEN_LOGIN_*', async () => {
  const json = (path, init = {}, h = {}) => fetch(base + path, { ...init, headers: { 'Content-Type': 'application/json', ...h } });
  assert.equal((await json('/api/session')).status, 401);
  const ok = await json('/api/session', {}, { Cookie: cookie });
  assert.deepEqual([ok.status, await ok.json()], [200, { required: true, user: USER }]);
  assert.equal((await json('/api/session', {}, { Origin: 'https://evil.example' })).status, 403);

  const bad = await json('/api/login', { method: 'POST', body: JSON.stringify({ user: USER, password: 'wrong' }) });
  assert.deepEqual([bad.status, bad.headers.get('set-cookie')], [401, null]);
  assert.equal((await json('/api/login', { method: 'POST', body: '{not json' })).status, 400);
  assert.equal((await json('/api/login', { method: 'POST', body: '{}', headers: {} }, { Origin: 'https://evil.example' })).status, 403);

  const plan = (h) => json('/api/plan', { method: 'POST', body: JSON.stringify({ text: 'ร้านกาแฟ' }) }, h);
  assert.equal((await plan({})).status, 401, 'ไม่ login ห้ามใช้โควตา Typhoon');
  assert.equal((await plan({ Cookie: cookie })).status, 200);

  const out = await json('/api/logout', { method: 'POST' });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /^iegen_session=; .*Max-Age=0/);
});
