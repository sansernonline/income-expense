/* แผนรายรับรายจ่าย: แม่แบบกลาง + ตัวทำความสะอาดแผนที่ AI ส่งมา (BR-060, NFR-SEC-020)
   ใช้ได้ทั้งเบราว์เซอร์ (window.IE) และ Node (require) */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IE = Object.assign(root.IE || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  const LIMITS = { revenue: 5, daily: 2, weekly: 3, monthly: 8, name: 40 };
  const MAX_DAYS = 366; // FR-SET-020

  const FALLBACK_PLAN = {
    revenue: [{ name: 'ยอดขายหน้าร้าน', weight: 100 }],
    expenses: [
      { name: 'ซื้อวัตถุดิบ/สินค้า', pct: 30, freq: 'weekly' },
      { name: 'ค่าแรงพนักงาน', pct: 15, freq: 'monthly', day: 28 },
      { name: 'ค่าเช่าที่', pct: 10, freq: 'monthly', day: 1 },
      { name: 'ค่าน้ำ ค่าไฟ', pct: 5, freq: 'monthly', day: 5 },
      { name: 'ค่าใช้จ่ายจิปาถะ', pct: 5, freq: 'daily' },
    ],
  };

  const num = (v, lo, hi, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  const text = (v) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, LIMITS.name);

  /** รับค่าอะไรก็ได้ คืนแผนที่ปลอดภัย หรือ null ถ้าใช้ไม่ได้ */
  function sanitizePlan(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const revenue = (Array.isArray(raw.revenue) ? raw.revenue : [])
      .map((r) => ({ name: text(r && r.name), weight: num(r && r.weight, 1, 100, 1) }))
      .filter((r) => r.name)
      .slice(0, LIMITS.revenue);
    const count = { daily: 0, weekly: 0, monthly: 0 };
    const expenses = [];
    for (const e of Array.isArray(raw.expenses) ? raw.expenses : []) {
      const freq = e && ['daily', 'weekly', 'monthly'].includes(e.freq) ? e.freq : null;
      const name = text(e && e.name);
      if (!freq || !name || count[freq] >= LIMITS[freq]) continue;
      count[freq]++;
      const item = { name, pct: num(e.pct, 0, 60, 1), freq };
      if (freq === 'monthly') item.day = Math.round(num(e.day, 1, 28, 1));
      expenses.push(item);
    }
    if (!revenue.length || !expenses.length) return null;
    return { revenue, expenses };
  }

  /** ค่าตั้งค่าที่ AI เติมให้ (FR-BIZ-050): คืนเฉพาะค่าที่ใช้ได้ */
  function sanitizeSettings(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const money = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 1e9 ? Math.round(n) : null; };
    const one = money(raw.monthlyRevenue);
    const lo = money(raw.monthlyRevenueMin) ?? one, hi = money(raw.monthlyRevenueMax) ?? one;
    if (lo && hi) { out.monthMin = Math.min(lo, hi); out.monthMax = Math.max(lo, hi); }
    const ok = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
    const days = (Date.parse(raw.endDate) - Date.parse(raw.startDate)) / 864e5 + 1;
    if (ok(raw.startDate) && ok(raw.endDate) && raw.startDate <= raw.endDate && days <= MAX_DAYS) {
      out.startDate = raw.startDate;
      out.endDate = raw.endDate;
    }
    return out;
  }

  return { FALLBACK_PLAN, sanitizePlan, sanitizeSettings, LIMITS };
});
