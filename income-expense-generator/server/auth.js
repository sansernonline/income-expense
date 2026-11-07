/* login บัญชีเดียว: ชื่อผู้ใช้ + รหัสผ่านที่แฮชด้วย scrypt เก็บใน env · เซสชันเป็นคุกกี้ลงลายเซ็น HMAC ไม่มีที่เก็บฝั่งเซิร์ฟเวอร์
   เปลี่ยน IEGEN_SESSION_SECRET เมื่อไรทุกคนต้องเข้าระบบใหม่ · ไม่มี "ลืมรหัสผ่าน" ผู้ดูแลรีเซ็ตด้วยการเปลี่ยน env */
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'iegen_session';
const SHORT_MS = 12 * 60 * 60 * 1000; // ไม่ติ๊ก "จำฉันไว้": คุกกี้หายเมื่อปิดเบราว์เซอร์ และเซิร์ฟเวอร์ไม่รับหลัง 12 ชั่วโมง
const LONG_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_BYTES = 64;
const SEP = ':'; // ไม่ใช้ $ เพราะตัวโหลด .env หลายตัวตีความ $xxx เป็นตัวแปร
const ENV = ['IEGEN_LOGIN_USER', 'IEGEN_LOGIN_PASSWORD_HASH', 'IEGEN_SESSION_SECRET'];
const MIN_SECRET = 32;
const FAIL_MAX = 5; // รหัสผิดได้กี่ครั้งต่อ IP ใน 15 นาที
const FAIL_WINDOW = 15 * 60 * 1000;
// เพดานรวมทุก IP: IP มาจาก X-Forwarded-For ซึ่งผู้ส่งปลอมได้ เปลี่ยน IP ไปเรื่อย ๆ ก็ยังเดารหัสได้ไม่เกินนี้ (แลกกับเจ้าของอาจถูกล็อกด้วย 15 นาที)
const FAIL_MAX_ALL = 50;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sign = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex');
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

/** รูปแบบที่เก็บใน IEGEN_LOGIN_PASSWORD_HASH: scrypt:<salt hex>:<hash hex> · scripts/password-hash.js สร้างรูปแบบเดียวกัน */
async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_BYTES);
  return ['scrypt', salt.toString('hex'), key.toString('hex')].join(SEP);
}

/** เทียบแบบเวลาคงที่ · ค่าที่เก็บผิดรูปแบบถือว่าไม่ตรง ไม่ throw */
async function verifyPassword(password, stored) {
  const [prefix, saltHex, hashHex] = String(stored).split(SEP);
  if (prefix !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (!expected.length) return false;
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

/** ไม่ตั้งสักตัว → null (ไม่มี login) · ตั้งไม่ครบหรือความลับสั้นเกิน → throw บอกชื่อ ไม่บอกค่า */
function loadAuthConfig(env = process.env) {
  const set = ENV.filter((n) => (env[n] || '').trim());
  if (!set.length) return null;
  const missing = ENV.filter((n) => !set.includes(n));
  if (missing.length) throw new Error(`ตั้งค่า login ไม่ครบ ขาด ${missing.join(' และ ')} (สร้างค่าด้วย npm run password-hash)`);
  const secret = env.IEGEN_SESSION_SECRET.trim();
  if (secret.length < MIN_SECRET) throw new Error(`IEGEN_SESSION_SECRET ต้องยาวอย่างน้อย ${MIN_SECRET} ตัวอักษร`);
  return { user: env.IEGEN_LOGIN_USER.trim(), passwordHash: env.IEGEN_LOGIN_PASSWORD_HASH.trim(), secret };
}

/** ค่าในคุกกี้: v1.<หมดอายุ ms>.<สุ่ม>.<HMAC> */
function createSession(secret, remember, now = Date.now()) {
  const expiresAt = now + (remember ? LONG_MS : SHORT_MS);
  const body = `v1.${expiresAt}.${crypto.randomBytes(16).toString('hex')}`;
  return { value: `${body}.${sign(secret, body)}`, expiresAt, remember };
}

function isValidSession(value, secret, now = Date.now()) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expected = sign(secret, parts.slice(0, 3).join('.'));
  if (parts[3].length !== expected.length || !crypto.timingSafeEqual(Buffer.from(parts[3]), Buffer.from(expected))) return false;
  return Number(parts[1]) > now;
}

const cookieHeader = (s, secure) => `${COOKIE}=${s.value}; HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}${s.remember ? `; Expires=${new Date(s.expiresAt).toUTCString()}` : ''}`;
const clearedCookie = `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
const readCookie = (req) => ((req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '=')) || '').slice(COOKIE.length + 1);

/** cfg จาก loadAuthConfig · cfg เป็น null = ไม่มี login (enabled = false) */
function createAuth(cfg) {
  const fails = new Map();

  function blocked(ip, now) {
    for (const [k, v] of fails) if (now - v[v.length - 1] >= FAIL_WINDOW) fails.delete(k); // ไม่ให้ Map โตไม่หยุด
    const recent = (fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW);
    let total = 0;
    for (const v of fails.values()) total += v.filter((t) => now - t < FAIL_WINDOW).length;
    return recent.length >= FAIL_MAX || total >= FAIL_MAX_ALL;
  }

  /** คุกกี้เซสชันถูกต้องและยังไม่หมดอายุ */
  const check = (req, now = Date.now()) => Boolean(cfg) && isValidSession(readCookie(req), cfg.secret, now);

  /** ด่านของ /api/plan: ไม่มี login = ผ่านทุกคน · มีแล้วต้องเข้าระบบ */
  const allows = (req, now) => !cfg || check(req, now);

  /** GET /api/session: หน้าเว็บถามว่าต้อง login ไหม · ยังไม่เข้าระบบได้ 401 (ไม่นับเป็นรหัสผิด) */
  const session = (req, now) => {
    if (!cfg) return { status: 200, body: { required: false } };
    return check(req, now) ? { status: 200, body: { required: true, user: cfg.user } } : { status: 401, body: { error: 'ต้องเข้าสู่ระบบก่อน' } };
  };

  /** POST /api/login · คืน { status, body, cookie? } · ชื่อผิดกับรหัสผิดตอบข้อความเดียวกัน และคำนวณ scrypt ทุกครั้งเพื่อให้ใช้เวลาเท่ากัน */
  async function login(ip, input, secure, now = Date.now()) {
    if (!cfg) return { status: 404, body: { error: 'ไม่พบ' } };
    if (blocked(ip, now)) return { status: 429, body: { error: 'ใส่รหัสผิดหลายครั้ง รอ 15 นาทีแล้วลองใหม่' } };
    const { user, password, remember } = input && typeof input === 'object' ? input : {};
    if (typeof user !== 'string' || typeof password !== 'string' || !user || !password || user.length > 200 || password.length > 1000) return { status: 400, body: { error: 'ใส่ชื่อผู้ใช้และรหัสผ่านให้ครบ' } };
    const userOk = same(user.trim(), cfg.user);
    const passOk = await verifyPassword(password, cfg.passwordHash);
    if (userOk && passOk) {
      fails.delete(ip);
      return { status: 200, body: { ok: true }, cookie: cookieHeader(createSession(cfg.secret, remember === true, now), secure) };
    }
    fails.set(ip, [...(fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW), now]);
    return { status: 401, body: { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } };
  }

  return { enabled: Boolean(cfg), check, allows, session, login, logoutCookie: clearedCookie };
}

module.exports = { hashPassword, verifyPassword, loadAuthConfig, createSession, isValidSession, createAuth, COOKIE };
