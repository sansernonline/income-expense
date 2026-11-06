/* เซิร์ฟเวอร์ตัวเล็ก: เสิร์ฟหน้าเว็บ + POST /api/plan  (NFR-SEC-010/020) — รัน: node server/server.js */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { requestPlan } = require('./typhoon.js');
const { createHistory } = require('./history.js');
const { b2Config } = require('./b2.js');

// อ่าน .env ด้วยตัวเอง (ไม่ใช้แพ็กเกจ) ค่าที่ตั้งใน environment ชนะไฟล์
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cfg = {
  apiKey: process.env.TYPHOON_API_KEY || '',
  baseUrl: (process.env.TYPHOON_BASE_URL || 'https://api.opentyphoon.ai/v1').replace(/\/$/, ''),
  model: process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct',
};
const PORT = Number(process.env.PORT) || 3000;
// เครื่องตัวเอง: 127.0.0.1 · บน Render ต้องเป็น 0.0.0.0 (render.yaml ตั้ง HOST ให้)
const HOST = process.env.HOST || '127.0.0.1';
const RATE_MAX = Number(process.env.RATE_LIMIT_PER_MIN) || 10; // กันคนอื่นใช้โควตา Typhoon จนหมด
const MAX_BODY = 10 * 1024;
const PUBLIC = path.join(__dirname, '..', 'public');
// ประวัติ: SQLite ใน DATA_DIR · สำรองไป B2 เมื่อตั้งค่า B2_* ครบ (ตั้งไม่ครบ = หยุดตั้งแต่เริ่ม ไม่เงียบ)
const history = createHistory({ dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'), password: process.env.APP_PASSWORD || '', b2cfg: b2Config() });
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        chunks.length = 0;
        reject(Object.assign(new Error('too large'), { code: 413 }));
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** NFR-SEC-020: คำขอที่มี Origin ต้องเป็นโฮสต์เดียวกับเว็บนี้ (กันเว็บอื่นสั่งใช้โควตา Typhoon) เทียบเฉพาะโฮสต์ เพราะหลัง proxy ของ Render เป็น https */
const sameOrigin = (req) => {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
};

/** จำกัดจำนวนคำขอ /api/plan ต่อ IP ต่อนาที · หลัง proxy ใช้ IP ตัวแรกของ X-Forwarded-For เมื่อ TRUST_PROXY=1 */
const hits = new Map();
const clientIp = (req) => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
function rateLimited(req, now = Date.now()) {
  const ip = clientIp(req), recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > 60000) hits.delete(k);
  return recent.length > RATE_MAX;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'POST' && url.pathname === '/api/plan') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'ไม่อนุญาตคำขอจากเว็บอื่น' });
    if (rateLimited(req)) return send(res, 429, { error: 'ขอบ่อยเกินไป รอสักครู่แล้วลองใหม่' });
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (!body || typeof body.text !== 'string') return send(res, 400, { error: 'กรุณาบอกประเภทธุรกิจ' });
      const text = body.text.trim().slice(0, 500);
      if (!text) return send(res, 400, { error: 'กรุณาบอกประเภทธุรกิจ' });
      const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
      return send(res, 200, await requestPlan(cfg, text, today));
    } catch (err) {
      if (err.code === 413) { res.once('finish', () => req.destroy()); return send(res, 413, { error: 'ข้อความยาวเกินไป' }); } // ตอบก่อนแล้วค่อยตัดการเชื่อมต่อ
      return send(res, 400, { error: 'คำขอไม่ถูกต้อง' });
    }
  }
  if (url.pathname.startsWith('/api/ledgers')) {
    if (!sameOrigin(req)) return send(res, 403, { error: 'ไม่อนุญาตคำขอจากเว็บอื่น' });
    try {
      const r = await history.handle(req, url, clientIp(req), (limit) => readBody(req, limit));
      return send(res, r.status, r.body);
    } catch (err) {
      if (err.code === 413) { res.once('finish', () => req.destroy()); return send(res, 413, { error: 'ข้อมูลใหญ่เกินไป' }); }
      console.error('ประวัติ: ' + err.message);
      return send(res, 500, { error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });

  let rel;
  try { rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return send(res, 400, { error: 'ที่อยู่ไม่ถูกต้อง' }); }
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) || !TYPES[path.extname(file)]) return send(res, 404, 'not found', 'text/plain');
  fs.readFile(file, (err, data) => (err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, data, TYPES[path.extname(file)])));
});

/** ค่าตั้งต้นเปิดรับที่ 127.0.0.1 เท่านั้น (NFR-SEC-020) · เปิดกว้างได้เฉพาะเมื่อตั้ง HOST เอง (ใช้บน Render) */
const start = (port = PORT, onListen) => server.listen(port, HOST, onListen);

if (require.main === module) {
  start(PORT, () => console.log(`IEGEN เปิดที่ http://${HOST}:${PORT} · Typhoon: ${cfg.apiKey ? 'ตั้งคีย์แล้ว' : 'ยังไม่ตั้งคีย์ (AI ใช้ไม่ได้ คงหมวดเดิม)'} · ประวัติ: ${process.env.APP_PASSWORD ? 'เปิด' : 'ปิด (ยังไม่ตั้ง APP_PASSWORD)'} · สำรอง B2: ${b2Config() ? 'เปิด' : 'ปิด'}`));
  // Render ส่ง SIGTERM ก่อนปิดเครื่อง: รอการสำรองที่ค้างให้จบก่อน
  process.once('SIGTERM', () => server.close(() => history.close().finally(() => process.exit(0))));
}
module.exports = { server, start, history };
