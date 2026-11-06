/* สร้าง mockup/IEGEN-mockup.html ไฟล์เดียว กดได้จริง จากโค้ดแอป + ข้อมูลตัวอย่าง (ไม่ต้องรันเซิร์ฟเวอร์)
   รัน: node scripts/build-mockup.js */
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');

const stub = `
/* mockup: ตัวแทน Typhoon ที่ตอบเร็วและตอบแบบเดียวทุกครั้ง */
window.__mockAi = 'up';
/* mockup: ตัวแทน /api/ledgers เก็บในหน่วยความจำ รหัสอะไรก็เข้าได้ */
const mockLedgers = [];
const ledgerApi = (url, opts = {}) => {
  const id = Number(url.split('/')[3]);
  const reply = (body) => ({ ok: true, status: 200, json: async () => body });
  if (opts.method === 'POST') {
    const { name, data } = JSON.parse(opts.body);
    mockLedgers.unshift({ id: Date.now(), name, data, savedAt: new Date().toISOString(), start: data.settings.start, end: data.settings.end, rowCount: data.rows.length });
    return reply({ backup: 'off' });
  }
  if (opts.method === 'DELETE') { mockLedgers.splice(mockLedgers.findIndex((l) => l.id === id), 1); return reply({ backup: 'off' }); }
  if (id) return reply(mockLedgers.find((l) => l.id === id));
  return reply({ items: mockLedgers.map(({ data, ...meta }) => meta) });
};
window.fetch = async (url, opts) => {
  if (String(url).startsWith('/api/ledgers')) return ledgerApi(String(url), opts);
  await new Promise((r) => setTimeout(r, 700));
  if (window.__mockAi === 'down') throw new Error('mock: AI down');
  return { ok: true, json: async () => ({ source: 'typhoon', note: '', settings: { monthlyRevenueMin: 100000, monthlyRevenueMax: 140000 }, plan: {
    revenue: [{ name: 'ขายกาแฟ', weight: 60 }, { name: 'ขายเบเกอรี่', weight: 28 }, { name: 'ขายเมล็ดกาแฟ', weight: 12 }],
    expenses: [
      { name: 'ซื้อเมล็ดกาแฟ นม วัตถุดิบ', pct: 24, freq: 'weekly' }, { name: 'ซื้อเบเกอรี่จากโรงงาน', pct: 10, freq: 'weekly' },
      { name: 'ค่าเช่าร้าน', pct: 12, freq: 'monthly', day: 1 }, { name: 'เงินเดือนพนักงาน 2 คน', pct: 18, freq: 'monthly', day: 30 },
      { name: 'ค่าไฟฟ้า', pct: 4, freq: 'monthly', day: 8 }, { name: 'ค่าน้ำประปา', pct: 0.8, freq: 'monthly', day: 8 },
      { name: 'ค่าอินเทอร์เน็ต', pct: 0.6, freq: 'monthly', day: 10 }, { name: 'แก้วและบรรจุภัณฑ์', pct: 3, freq: 'daily' } ] } }) };
};`;

const bar = `
<div class="mockbar" role="toolbar" aria-label="ตัวควบคุมของ mockup">
  <b>MOCKUP</b>
  <button type="button" id="mb-empty">1 · เริ่มใหม่ (ว่าง)</button>
  <button type="button" id="mb-gen">2 · เลือกร้านกาแฟ + สร้างรายการ</button>
  <button type="button" id="mb-ai">3 · ให้ AI ปรับ (AI ตอบ)</button>
  <button type="button" id="mb-down">4 · ให้ AI ปรับ (AI ใช้ไม่ได้)</button>
  <span>ย่อหน้าต่าง ≤ 860 px เพื่อดูแบบมือถือ</span>
</div>`;
const barCss = `
.mockbar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 16px;background:#131318;color:#F2F2F5;font-size:12px;z-index:9}
.mockbar b{letter-spacing:.08em;color:#FB7185}.mockbar button{height:28px;padding:0 12px;border-radius:999px;border:1px solid #55555F;color:#F2F2F5}
.mockbar button:hover{background:#26262E}.mockbar span{color:#A9A9B6;margin-left:auto}
body{padding-bottom:48px}@media print{.mockbar{display:none}}`;
const barJs = `
(function(){const $=(i)=>document.getElementById(i);
const pick=()=>{if(!document.querySelector('[data-type=coffee][aria-pressed=true]'))document.querySelector('[data-type=coffee]').click();};
$('mb-empty').onclick=()=>{try{localStorage.removeItem('iegen.v1')}catch(e){}location.reload();};
$('mb-gen').onclick=()=>{pick();$('btn-gen').click();};
$('mb-ai').onclick=()=>{window.__mockAi='up';pick();$('btn-ai').click();};
$('mb-down').onclick=()=>{window.__mockAi='down';pick();$('btn-ai').click();};})();`;

let html = read('index.html')
  .replace('<title>Income &amp; Expense · สร้างรายรับรายจ่ายจำลอง</title>', '<title>Income &amp; Expense · ต้นแบบที่กดได้</title>')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${read('styles.css')}${barCss}\n</style>`)
  .replace('<script src="plan.js"></script>', `<script>\n${read('plan.js')}\n</script>`)
  .replace('<script src="presets.js"></script>', `<script>
${read('presets.js')}
</script>`)
  .replace('<script src="ledger.js"></script>', `<script>\n${read('ledger.js')}\n</script>`)
  .replace('<script src="history.js"></script>', `<script>\n${read('history.js')}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${stub}\n${read('app.js')}\n${barJs}\n</script>`)
  .replace('<div class="toast"', `${bar}\n<div class="toast"`);

const out = path.join(__dirname, '..', '..', 'mockup', 'IEGEN-mockup.html');
fs.writeFileSync(out, html);
console.log('เขียน', out, html.length, 'ตัวอักษร');
