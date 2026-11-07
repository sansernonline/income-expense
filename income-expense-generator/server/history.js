/* /api/ledgers: บันทึก เปิด ลบ ชุดรายรับรายจ่าย · ต้อง login (server/auth.js) · สำรองไฟล์ไป B2 ทุกครั้งที่ข้อมูลเปลี่ยน */
const fs = require('node:fs');
const path = require('node:path');
const { openStore } = require('./store.js');
const b2 = require('./b2.js');

const MAX_BODY = 2 * 1024 * 1024; // 366 วัน วันละหลายรายการยังห่างเพดานนี้มาก
const MAX_ROWS = 20000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** auth: จาก createAuth (server/auth.js) · ใช้แค่ auth.enabled กับ auth.check(req) */
function createHistory({ dataDir, auth, b2cfg, log = console.error }) {
  const file = path.join(dataDir, 'iegen.sqlite');

  // เปิดฐานข้อมูลครั้งแรกที่มีคนใช้ · ไม่มีไฟล์ในเครื่อง (เช่น Render เพิ่งรีสตาร์ต) ดึงจาก B2 ก่อน
  // ดึงไม่สำเร็จจะไม่เปิดฐานว่าง เพราะบันทึกครั้งต่อไปจะส่งฐานว่างไปทับไฟล์ล่าสุดบน B2
  let opening = null;
  const open = () => (opening ||= (async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    if (b2cfg && !fs.existsSync(file)) { const buf = await b2.download(b2cfg); if (buf) fs.writeFileSync(file, buf); }
    return openStore(file);
  })().catch((err) => { opening = null; throw err; }));

  // สำรองทีละครั้งตามลำดับ · คืน 'ok' | 'failed' | 'off' ให้หน้าจอบอกผู้ใช้
  let chain = Promise.resolve();
  const backup = (store) => {
    if (!b2cfg) return Promise.resolve('off');
    chain = chain.then(() => b2.upload(b2cfg, store.snapshot(file + '.snap'))).then(() => 'ok', (err) => { log('สำรองไป B2 ไม่สำเร็จ: ' + err.message); return 'failed'; });
    return chain;
  };

  /** ตรวจของที่จะบันทึก · คืนข้อความ error หรือ null */
  function invalid(body) {
    if (!isObj(body) || typeof body.name !== 'string' || !isObj(body.data)) return 'ข้อมูลที่ส่งมาไม่ถูกต้อง';
    const name = body.name.trim();
    if (!name || name.length > 100) return 'ชื่อชุดต้องมี 1–100 ตัวอักษร';
    const { settings, rows } = body.data;
    if (!isObj(settings) || !Array.isArray(rows) || !rows.every(isObj)) return 'ข้อมูลตารางไม่ถูกต้อง';
    if (rows.length > MAX_ROWS) return `รายการเกิน ${MAX_ROWS} แถว`;
    for (const k of ['start', 'end']) if (settings[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(settings[k])) return 'วันที่ในข้อมูลไม่ถูกต้อง';
    return null;
  }

  /** คืน { status, body } · url ไม่ใช่ /api/ledgers คืน null · readBody(limit) อ่านเนื้อคำขอ */
  async function handle(req, url, readBody) {
    const m = url.pathname.match(/^\/api\/ledgers(?:\/(\d{1,12}))?\/?$/);
    if (!m) return url.pathname.startsWith('/api/ledgers') ? { status: 404, body: { error: 'ไม่พบ' } } : null;
    if (!auth.enabled) return { status: 503, body: { error: 'ยังไม่ได้เปิดใช้ประวัติ ตั้งค่า login ที่เซิร์ฟเวอร์ก่อน' } };
    if (!auth.check(req)) return { status: 401, body: { error: 'ต้องเข้าสู่ระบบก่อน' } };
    let store;
    try { store = await open(); } catch (err) {
      log('เปิดฐานข้อมูลไม่ได้: ' + err.message);
      return { status: 503, body: { error: 'เปิดฐานข้อมูลไม่ได้ (ดึงไฟล์สำรองจาก B2 ไม่สำเร็จ) ลองใหม่อีกครั้ง' } };
    }
    const id = m[1] && Number(m[1]);
    if (!id && req.method === 'GET') return { status: 200, body: { items: store.list(), backup: b2cfg ? 'on' : 'off' } };
    if (!id && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(MAX_BODY)); } catch (err) { if (err.code === 413) throw err; return { status: 400, body: { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' } }; }
      const error = invalid(body);
      if (error) return { status: 400, body: { error } };
      const { settings, rows, plan = null, nextId = rows.length + 1 } = body.data;
      const newId = store.add(body.name.trim(), { settings, rows, plan, nextId });
      return { status: 201, body: { id: newId, backup: await backup(store) } };
    }
    if (id && req.method === 'GET') { const item = store.get(id); return item ? { status: 200, body: item } : { status: 404, body: { error: 'ไม่พบชุดนี้' } }; }
    if (id && req.method === 'DELETE') return store.remove(id) ? { status: 200, body: { backup: await backup(store) } } : { status: 404, body: { error: 'ไม่พบชุดนี้' } };
    return { status: 405, body: { error: 'method not allowed' } };
  }

  /** รอให้การสำรองที่ค้างอยู่เสร็จ แล้วปิดฐานข้อมูล (ใช้ตอนปิดเซิร์ฟเวอร์และใน test) */
  async function close() { await chain; if (opening) { const s = await opening.catch(() => null); if (s) s.close(); opening = null; } }

  return { handle, close };
}

module.exports = { createHistory };
