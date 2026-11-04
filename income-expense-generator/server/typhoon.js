/* ตัวเชื่อม Typhoon: ขอ "แผน" จากข้อความธุรกิจ (FR-CHT-030/040) ค่าตั้งอยู่ใน .env */
const { FALLBACK_PLAN, sanitizePlan, sanitizeSettings } = require('../public/plan.js');

const TIMEOUT_MS = 40000; // NFR-PERF-020

const SYSTEM = `คุณช่วยวางแผนรายรับรายจ่ายจำลองของธุรกิจ ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น รูปแบบ:
{"settings":{"monthlyRevenueMin":บาทต่อเดือนต่ำสุด หรือ null,"monthlyRevenueMax":บาทต่อเดือนสูงสุด หรือ null,"startDate":"YYYY-MM-DD" หรือ null,"endDate":"YYYY-MM-DD" หรือ null},
"revenue":[{"name":"ชื่อรายรับ","weight":1-100}],
"expenses":[{"name":"ชื่อรายจ่าย","pct":ร้อยละของรายรับรวมต่อเดือน,"freq":"daily|weekly|monthly","day":1-28 เฉพาะ monthly}]}
กติกา: revenue 1-5 รายการ (weight คือสัดส่วนเทียบกัน) · expenses ที่ daily ไม่เกิน 2, weekly ไม่เกิน 3, monthly ไม่เกิน 8 · ผลรวม pct ประมาณ 65-90 ·
ชื่อเป็นภาษาไทยสั้น ๆ เหมาะกับธุรกิจที่ผู้ใช้บอก (วัตถุดิบ ค่าเช่า ค่าแรง ค่าน้ำไฟ ฯลฯ) · ใส่ค่าใน settings เฉพาะที่ผู้ใช้ระบุเอง ไม่ระบุให้ null (ถ้าผู้ใช้บอกรายรับต่อเดือนค่าเดียว ใส่ค่าเดียวกันทั้ง Min และ Max)`;

function extractJson(content) {
  const s = String(content || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

async function callOnce(cfg, userText, today) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `วันนี้คือ ${today}\nธุรกิจ: ${userText}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Typhoon ตอบรหัส ${res.status}`);
    const data = await res.json();
    return extractJson(data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content);
  } finally {
    clearTimeout(timer);
  }
}

/** BR-060: รายจ่ายรวมต้องไม่เกิน 90% ของรายรับ (AI มักตอบรวม 100%) ถ้าเกินให้ย่อทุกหมวดตามสัดส่วนเหลือ 85% */
function capExpenses(plan) {
  const sum = plan.expenses.reduce((a, e) => a + e.pct, 0);
  if (sum <= 90) return plan;
  const k = 85 / sum;
  return { ...plan, expenses: plan.expenses.map((e) => ({ ...e, pct: Math.round(e.pct * k * 10) / 10 })) };
}

/** คืน { plan, settings, source, note } เสมอ — ล้มเหลวแล้วใช้แม่แบบกลาง */
async function requestPlan(cfg, userText, today) {
  const fallback = (note) => ({ plan: FALLBACK_PLAN, settings: {}, source: 'fallback', note });
  if (!cfg.apiKey) return fallback('ยังไม่ได้ตั้งคีย์ Typhoon จึงใช้แม่แบบกลาง');
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await callOnce(cfg, userText, today);
      const plan = sanitizePlan(raw);
      if (plan) return { plan: capExpenses(plan), settings: /\d/.test(userText) ? sanitizeSettings(raw.settings) : {}, source: 'typhoon', note: '' };
    }
    return fallback('Typhoon ตอบรูปแบบที่ใช้ไม่ได้ จึงใช้แม่แบบกลาง');
  } catch (err) {
    const timeout = err && err.name === 'AbortError';
    return fallback(timeout ? 'Typhoon ตอบช้าเกิน 40 วินาที จึงใช้แม่แบบกลาง' : 'เชื่อมต่อ Typhoon ไม่ได้ จึงใช้แม่แบบกลาง');
  }
}

module.exports = { requestPlan, extractJson };
