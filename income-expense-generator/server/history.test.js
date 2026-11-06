/* ประวัติ /api/ledgers: รหัสผ่าน · บันทึก เปิด ลบ · สำรองไป B2 และดึงกลับตอนเครื่องเริ่มใหม่ (B2 จำลองเป็น http server ในเครื่อง) */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHistory } = require('./history.js');

const PASS = 'test-pass-123';
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

let srv, base, b2cfg;
const origErr = console.error, logs = [];
test.before(async () => {
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  b2cfg = { B2_ENDPOINT: `http://127.0.0.1:${mock.address().port}`, B2_REGION: 'us-west-004', B2_BUCKET: 'iegen-test', B2_KEY_ID: 'kid', B2_APPLICATION_KEY: 'appkey' };
  Object.assign(process.env, b2cfg, { APP_PASSWORD: PASS, DATA_DIR: tmp('srv') });
  console.error = (...a) => logs.push(a.join(' '));
  const app = require('./server.js');
  srv = app.server;
  await new Promise((r) => app.start(0, r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => { console.error = origErr; srv.close(); mock.close(); });

const api = (p, { method = 'GET', body, pass = PASS, headers = {} } = {}) =>
  fetch(base + '/api/ledgers' + p, { method, headers: { 'Content-Type': 'application/json', ...(pass ? { Authorization: 'Bearer ' + pass } : {}), ...headers }, body: body && JSON.stringify(body) });
const sample = (n = 3) => ({ settings: { start: '2026-01-01', end: '2026-01-31', opening: 0 }, rows: Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-01-02', name: 'ขาย', income: 100, expense: 0 })), plan: null, nextId: n + 1 });

test('ไม่มีรหัสหรือรหัสผิด → 401 · คำขอจากเว็บอื่น → 403', async () => {
  assert.equal((await api('', { pass: '' })).status, 401);
  assert.equal((await api('', { pass: 'wrong' })).status, 401);
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
  const bad = await fetch(base + '/api/ledgers', { method: 'POST', headers: { Authorization: 'Bearer ' + PASS }, body: '{not json' });
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
  const h = createHistory({ dataDir: tmp('restore'), password: PASS, b2cfg: { base: b2cfg.B2_ENDPOINT, bucket: 'iegen-test', keyId: 'kid', secret: 'appkey', region: 'us-west-004', objectKey: 'iegen/iegen.sqlite' } });
  const r = await h.handle({ method: 'GET', headers: { authorization: 'Bearer ' + PASS } }, new URL('http://x/api/ledgers'), 'ip');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.some((x) => x.name === 'ร้านกาแฟ ม.ค.'));
  await h.close();
});

test('ดึงจาก B2 ไม่สำเร็จ → 503 ไม่เปิดฐานว่าง · B2 กลับมาแล้วใช้ได้', async () => {
  const dir = tmp('fail');
  const h = createHistory({ dataDir: dir, password: PASS, b2cfg: { base: b2cfg.B2_ENDPOINT, bucket: 'iegen-test', keyId: 'kid', secret: 'appkey', region: 'us-west-004', objectKey: 'iegen/iegen.sqlite' }, log: () => {} });
  const req = { method: 'GET', headers: { authorization: 'Bearer ' + PASS } }, url = new URL('http://x/api/ledgers');
  b2.failGet = true;
  assert.equal((await h.handle(req, url, 'ip')).status, 503);
  assert.equal(fs.existsSync(path.join(dir, 'iegen.sqlite')), false);
  b2.failGet = false;
  assert.equal((await h.handle(req, url, 'ip')).status, 200);
  await h.close();
});

test('ไม่ตั้ง APP_PASSWORD → 503 · รหัสผิด 10 ครั้ง → 429 แม้รอบต่อไปใส่ถูก', async () => {
  const url = new URL('http://x/api/ledgers');
  const off = createHistory({ dataDir: tmp('off'), password: '', b2cfg: null });
  assert.equal((await off.handle({ method: 'GET', headers: {} }, url, 'ip')).status, 503);

  const h = createHistory({ dataDir: tmp('lock'), password: PASS, b2cfg: null });
  for (let i = 0; i < 10; i++) assert.equal((await h.handle({ method: 'GET', headers: { authorization: 'Bearer nope' } }, url, '1.2.3.4')).status, 401);
  assert.equal((await h.handle({ method: 'GET', headers: { authorization: 'Bearer ' + PASS } }, url, '1.2.3.4')).status, 429);
  const other = await h.handle({ method: 'GET', headers: { authorization: 'Bearer ' + PASS } }, url, '5.6.7.8');
  assert.deepEqual([other.status, other.body.backup], [200, 'off']);
  await h.close();
});
