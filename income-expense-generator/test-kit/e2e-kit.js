/* ตัวช่วยของ test ที่เปิดหน้าจริงในเบราว์เซอร์ (playwright-core + Chromium ที่ติดตั้งในเครื่องแล้ว)
   เซิร์ฟเวอร์ของแอปเปิดจริงที่พอร์ตสุ่ม ไม่มีคีย์ Typhoon · Typhoon ถูกแทนด้วย page.route ที่ตอบรูปแบบเดียวกับเซิร์ฟเวอร์ (ของข้างนอกเท่านั้นที่จำลอง) */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function findChrome() {
  if (process.env.IEGEN_CHROME && fs.existsSync(process.env.IEGEN_CHROME)) return process.env.IEGEN_CHROME;
  const home = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright') : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright') : path.join(os.homedir(), '.cache', 'ms-playwright'));
  if (!fs.existsSync(home)) return null;
  const dirs = fs.readdirSync(home).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = path.join(home, d, sub);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let playwright = null;
try { playwright = require('playwright-core'); } catch { /* ไม่ได้ติดตั้ง devDependency */ }
const CHROME = playwright && findChrome();
/** ใส่เป็น option ของ test: ไม่มีเบราว์เซอร์ → ข้าม (ไม่นับว่าผ่าน) */
const skip = CHROME ? false : 'ไม่พบ playwright-core หรือ Chromium ในเครื่อง';

const NOW = '2026-11-04T10:00:00';
const KEY = 'iegen.v1';

let ctx; // { server, base, browser }
async function boot() {
  if (ctx) return ctx;
  process.env.TYPHOON_API_KEY = ''; process.env.RATE_LIMIT_PER_MIN = '1000'; // ห้ามเรียก Typhoon จริง
  // ไม่ให้ login ใน .env ของเครื่องนี้ไปขวางทุกเทสต์ (ตัวโหลด .env ไม่ทับค่าที่ตั้งไว้แล้ว) · เทสต์ที่ต้องการ login ตั้งค่าเองก่อนเรียก open()
  for (const k of ['IEGEN_LOGIN_USER', 'IEGEN_LOGIN_PASSWORD_HASH', 'IEGEN_SESSION_SECRET']) if (!(k in process.env)) process.env[k] = '';
  const { server, start } = require('../server/server.js');
  await new Promise((r) => start(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ executablePath: CHROME });
  ctx = { server, base, browser };
  return ctx;
}
async function shutdown() {
  if (!ctx) return;
  await ctx.browser.close();
  ctx.server.close();
  ctx = null;
}

const planA = {
  revenue: [{ name: 'ขายหน้าร้าน', weight: 60 }, { name: 'เดลิเวอรี', weight: 40 }],
  expenses: [
    { name: 'วัตถุดิบ', pct: 30, freq: 'daily' }, { name: 'ค่าขนส่ง', pct: 5, freq: 'weekly' },
    { name: 'ค่าเช่า', pct: 20, freq: 'monthly', day: 5 }, { name: 'ค่าไฟ', pct: 5, freq: 'monthly', day: 25 }, { name: 'ค่าแรง', pct: 10, freq: 'monthly', day: 28 },
  ],
};
/** ค่า SETUP ของ test case: โหมดต่อเดือน มี.ค. 2026 เป้า 90,000 หยุดอาทิตย์ รายการรายรับต่อวัน 1–1 */
const SETUP = { type: 'other', biz: '', start: '2026-03-01', end: '2026-03-31', opening: 0, mode: 'month', monthMin: 90000, monthMax: 90000, dayMin: 2000, dayMax: 5000, monthlyRevenue: {}, closedWeekdays: [0], closedDates: [], margin: '', weekendPct: 30, jitterPct: 25, season: {}, seasonPct: 25, txMin: 1, txMax: 1, seed: '' };

/**
 * เปิดหน้าใหม่ (บริบทใหม่ = ข้อมูลเบราว์เซอร์ว่าง) เวลาเครื่องล็อกที่ 2026-11-04
 * opts: { width, height, state: {settings, plan, rows,...} ใส่ลง localStorage ก่อนโหลดครั้งแรกเท่านั้น, ai: handler ของ /api/plan }
 */
async function open(opts = {}) {
  const { browser, base } = await boot();
  const context = await browser.newContext({ viewport: { width: opts.width || 1440, height: opts.height || 900 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  page.aiCalls = [];
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  if (opts.state) {
    const st = { settings: { ...SETUP, ...(opts.state.settings || {}) }, rows: [], plan: null, prevRows: null, nextId: 1, ...opts.state, };
    st.settings = { ...SETUP, ...(opts.state.settings || {}) };
    await page.addInitScript(([k, s]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(s)); } catch (e) { /* ข้าม */ } }, [KEY, st]);
  }
  if (opts.ai) {
    await page.route('**/api/plan', async (route) => {
      page.aiCalls.push(JSON.parse(route.request().postData() || '{}'));
      await opts.ai(route, page.aiCalls.length);
    });
  }
  page.base = base;
  await page.goto(base + '/');
  return page;
}
const closeAll = async (page) => page.context().close();

/** ตอบแบบเซิร์ฟเวอร์ของเรา (typhoon สำเร็จ หรือ fallback พร้อมเหตุผล) */
const aiOk = (plan, settings = {}) => (route) => route.fulfill({ json: { plan, settings, source: 'typhoon', note: '' } });
const aiFail = (note) => (route) => route.fulfill({ json: { plan: {}, settings: {}, source: 'fallback', note } });

const state = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const toast = (page) => page.locator('#toast').innerText();
/** แถวในตาราง: [{date,name,income,expense,bal}] */
const table = (page) => page.$$eval('#rows tr', (trs) => trs.map((tr) => {
  const v = (f) => tr.querySelector(`[data-f=${f}]`).value;
  const n = (s) => Number(String(s).replace(/,/g, '')) || 0;
  return { date: v('date'), name: v('name'), income: n(v('income')), expense: n(v('expense')), bal: n(tr.querySelector('.bal').textContent) };
}));
const r2 = (n) => Math.round(n * 100) / 100;
const sumOf = (rows, k, pred = () => true) => r2(rows.filter(pred).reduce((a, r) => a + r[k], 0));
const click = (page, sel) => page.locator(sel).click();
const gen = async (page) => { await page.locator('#btn-gen').click(); await page.waitForTimeout(30); return table(page); };
const fillNum = async (page, sel, v) => { const l = page.locator(sel); await l.fill(String(v)); await l.dispatchEvent('change'); };
/** แถวหมวดในแผงตั้งค่า (kind: 'rev' | 'exp') */
const prow = (page, kind, i) => page.locator(`#${kind}-list .prow:not(.head)`).nth(i);
const names = (page, kind) => page.$$eval(`#${kind}-list .prow:not(.head) [data-f=name]`, (els) => els.map((e) => e.value));

module.exports = { skip, boot, shutdown, open, closeAll, aiOk, aiFail, state, toast, table, r2, sumOf, click, gen, fillNum, prow, names, planA, SETUP, KEY };
