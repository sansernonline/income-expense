/* สำรองไฟล์ฐานข้อมูลไป Backblaze B2 ผ่าน S3 API · ลายเซ็น AWS Signature v4 เขียนเองด้วย node:crypto (ไม่ใช้แพ็กเกจ) */
const crypto = require('node:crypto');

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (key, d) => crypto.createHmac('sha256', key).update(d).digest();
/** เข้ารหัส path ทีละช่วงตามกติกา S3 (encodeURIComponent ไม่เข้ารหัส !'()* ให้) */
const encPath = (p) => p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

/** คืน header ที่ต้องส่ง (รวม authorization) · url ต้องเข้ารหัส path แล้ว · ไม่รองรับ query string เพราะไม่ได้ใช้ */
function signV4({ method, url, headers = {}, payloadHash, region, keyId, secret, date = new Date() }) {
  const u = new URL(url);
  const amzDate = date.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  for (const [k, v] of Object.entries(headers)) all[k.toLowerCase()] = String(v).trim();
  const names = Object.keys(all).sort();
  const canonical = [method, u.pathname, '', names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  let key = hmac('AWS4' + secret, day);
  for (const part of [region, 's3', 'aws4_request']) key = hmac(key, part);
  const signature = crypto.createHmac('sha256', key).update(['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

const NAMES = ['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY'];
/** อ่านค่าจาก env · ไม่ตั้งเลย = ไม่สำรอง (null) · ตั้งไม่ครบ = error บอกชื่อที่ขาด (ไม่พิมพ์ค่า) */
function b2Config(env = process.env) {
  const missing = NAMES.filter((n) => !env[n]);
  if (missing.length === NAMES.length) return null;
  if (missing.length) throw new Error('ตั้งค่า B2 ไม่ครบ ขาด ' + missing.join(', '));
  const u = new URL(env.B2_ENDPOINT);
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('B2_ENDPOINT ต้องเป็น https');
  const region = env.B2_REGION || (u.hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/) || [])[1];
  if (!region) throw new Error('หา region จาก B2_ENDPOINT ไม่ได้ ตั้ง B2_REGION เอง');
  const folder = (env.B2_FOLDER || 'iegen-data').replace(/^\/+|\/+$/g, '');
  return { base: u.origin, bucket: env.B2_BUCKET, keyId: env.B2_KEY_ID, secret: env.B2_APPLICATION_KEY, region, objectKey: `${folder}/iegen.sqlite` };
}

function request(cfg, method, body) {
  const url = `${cfg.base}/${encPath(cfg.bucket)}/${encPath(cfg.objectKey)}`;
  const headers = signV4({ method, url, headers: body ? { 'content-type': 'application/octet-stream' } : {}, payloadHash: sha256(body || ''), region: cfg.region, keyId: cfg.keyId, secret: cfg.secret });
  delete headers.host; // fetch ใส่ host เองจาก url ค่าเดียวกัน
  return fetch(url, { method, headers, body, signal: AbortSignal.timeout(30000) });
}

/** ดึงไฟล์ล่าสุด · ยังไม่เคยสำรอง (404) คืน null */
async function download(cfg) {
  const r = await request(cfg, 'GET');
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`ดึงไฟล์จาก B2 ไม่สำเร็จ (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** อัปโหลดชื่อเดิมทุกครั้ง · B2 เก็บเป็นเวอร์ชันใหม่ เวอร์ชันเก่ายังอยู่จนกว่าจะตั้งกฎ lifecycle */
async function upload(cfg, buf) {
  const r = await request(cfg, 'PUT', buf);
  if (!r.ok) throw new Error(`อัปโหลดไป B2 ไม่สำเร็จ (HTTP ${r.status})`);
}

module.exports = { signV4, b2Config, download, upload };
