/* ตัวสร้างรายการรายรับรายจ่ายจากแผน (FR-GEN-*, BR-030/040/050) — ฟังก์ชันล้วน ไม่แตะหน้าจอ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IE = Object.assign(root.IE || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_DAYS = 366;
  const STEP = 10; // BR-040

  const eachDay = (start, end) => {
    const out = [];
    const d = new Date(start + 'T00:00:00Z');
    const e = new Date(end + 'T00:00:00Z');
    for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  };
  const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
  const monthsIn = (start, end) => [...new Set(eachDay(start, end).map((d) => d.slice(0, 7)))];
  const dayCount = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
  const round2 = (n) => Math.round(n * 100) / 100;

  /** แบ่ง total ตามน้ำหนัก ปัดเป็นผลคูณของ STEP แถวสุดท้ายรับเศษ → ผลรวมตรง total พอดี */
  function split(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = [];
    let used = 0;
    weights.forEach((w, i) => {
      const last = i === weights.length - 1;
      const v = last ? round2(total - used) : Math.round((total * w) / sum / STEP) * STEP;
      out.push(v);
      used = round2(used + v);
    });
    return out;
  }

  const pick = (items, rng) => {
    let r = rng() * items.reduce((a, i) => a + i.weight, 0);
    for (const it of items) if ((r -= it.weight) <= 0) return it;
    return items[items.length - 1];
  };
  /** น้ำหนักของวัน: ส.-อา. บวก boost · ศุกร์ได้ครึ่งหนึ่ง · สุ่ม ±jitter (ค่าเป็นสัดส่วน 0.3 = 30%) */
  const dayWeight = (iso, rng, boost, jitter) => {
    const wd = weekday(iso);
    const base = wd === 0 || wd === 6 ? 1 + boost : wd === 5 ? 1 + boost / 2 : 1;
    return base * (1 - jitter + 2 * jitter * rng());
  };

  /** ตัวสุ่มที่ผลซ้ำได้เมื่อใช้ seed เดิม (mulberry32) */
  const toSeed = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const seeded = (seed) => {
    let a = toSeed(seed);
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const has = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));
  const pctOf = (v, dflt, hi) => (has(v) ? Math.min(hi, Math.max(0, Number(v))) : dflt) / 100;

  /** ช่วง [min,max] ที่สลับให้ถูกลำดับ และไม่ติดลบ */
  const range = (a, b) => {
    const lo = Math.max(0, Number(a) || 0), hi = Math.max(0, Number(b) || 0);
    return lo <= hi ? [lo, hi] : [hi, lo];
  };
  const randIn = (lo, hi, rng, step) => Math.round((lo + (hi - lo) * rng()) / step) * step;
  /** เป้ารายเดือนที่สุ่ม: ผลคูณของ 100 ที่อยู่ในช่วง [lo,hi] · ช่วงแคบจนไม่มีผลคูณ 100 → ค่าเต็มบาทในช่วง (FR-GEN-020 ชนะ FR-SET-030) */
  const randTarget = (lo, hi, rng) => {
    const a = Math.ceil(lo / 100) * 100, b = Math.floor(hi / 100) * 100;
    return a <= b ? a + Math.round((rng() * (b - a)) / 100) * 100 : Math.round(lo + (hi - lo) * rng());
  };

  const openDays = (days, month, closedWeekdays, closedDates) =>
    days.filter((d) => d.startsWith(month) && !closedWeekdays.includes(weekday(d)) && !closedDates.includes(d));
  /** ตัวคูณยอดเดือน: ขายดี 1+p · ซบเซา 1−p · ปกติ 1 */
  const seasonFactor = (season, month, p) => { const k = season[Number(month.slice(5))]; return k === 'peak' ? 1 + p : k === 'slow' ? 1 - p : 1; };

  /** รายรับที่คาดทั้งช่วง (ใช้ค่ากลางของช่วงสุ่ม) · คิดแบบเดียวกับ generate แต่ไม่สุ่ม — ใช้แปลงคงเหลือ % ↔ บาทบนแผงตั้งค่า */
  function expectedRevenue(settings) {
    const { start, end, mode = 'month', monthlyRevenue = {}, closedWeekdays = [], closedDates = [], season = {} } = settings;
    if (!start || !end || start > end || dayCount(start, end) > MAX_DAYS) return 0;
    const [mMin, mMax] = range(settings.monthMin, settings.monthMax), [dMin, dMax] = range(settings.dayMin, settings.dayMax);
    const seasonP = pctOf(settings.seasonPct, 25, 60), days = eachDay(start, end);
    let sum = 0;
    for (const month of monthsIn(start, end)) {
      const open = openDays(days, month, closedWeekdays, closedDates).length;
      if (!open) continue;
      const f = seasonFactor(season, month, seasonP), fixed = Number(monthlyRevenue[month]);
      sum += mode === 'day' ? (open * f * (dMin + dMax)) / 2 : fixed > 0 ? fixed : (f * (mMin + mMax)) / 2;
    }
    return round2(sum);
  }

  /**
   * settings: { start, end, mode: 'month'|'day',
   *   monthMin, monthMax        — ช่วงรายรับต่อเดือน (โหมด month) แต่ละเดือนสุ่มในช่วง
   *   monthlyRevenue: {'YYYY-MM': n} — กำหนดเดือนใดเดือนหนึ่งเอง (ชนะการสุ่ม)
   *   dayMin, dayMax            — ช่วงรายรับต่อวันเปิด (โหมด day) ยอดเดือน = ผลรวมของวัน
   *   closedWeekdays, closedDates
   *   margin        — กำไรเป้าหมาย % (เว้นว่าง = ใช้ % รายจ่ายตามแผน)
   *   weekendPct    — ส.-อา. ขายดีกว่าวันธรรมดากี่ % (ศุกร์ได้ครึ่งหนึ่ง) ค่าตั้งต้น 30 · ใช้ในโหมด month
   *   jitterPct     — ความผันผวนรายวัน ± % ค่าตั้งต้น 25 · ใช้ในโหมด month
   *   season, seasonPct — { 1..12: 'peak'|'slow' } คูณยอดเดือนนั้นด้วย 1±seasonPct (ตั้งต้น 25) ทั้ง 2 โหมด
   *   txMin, txMax  — จำนวนรายการรายรับต่อวันเปิด (1-6) ตั้งต้น 1
   *   seed          — ใส่แล้วผลสุ่มซ้ำได้ }
   * plan: ผ่าน sanitizePlan แล้ว · คืนรายการ [{date,name,income,expense}] (ยังไม่มี id)
   */
  function generate(settings, plan, rng) {
    const { start, end, mode = 'month', monthlyRevenue = {}, closedWeekdays = [], closedDates = [], season = {} } = settings;
    rng = rng || (String(settings.seed ?? '') !== '' ? seeded(settings.seed) : Math.random);
    const [mMin, mMax] = range(settings.monthMin, settings.monthMax);
    const [dMin, dMax] = range(settings.dayMin, settings.dayMax);
    const [tMin, tMax] = range(Math.max(1, settings.txMin || 1), Math.max(1, settings.txMax || settings.txMin || 1));
    const boost = pctOf(settings.weekendPct, 30, 100), jitter = pctOf(settings.jitterPct, 25, 60), seasonP = pctOf(settings.seasonPct, 25, 60);
    const planPct = plan.expenses.reduce((a, e) => a + e.pct, 0);
    const scale = has(settings.margin) && planPct > 0 ? (100 - Math.min(95, Math.max(0, Number(settings.margin)))) / planPct : 1;
    const rows = [];
    const days = eachDay(start, end);
    for (const month of monthsIn(start, end)) {
      const open = openDays(days, month, closedWeekdays, closedDates);
      if (!open.length) continue;
      const f = seasonFactor(season, month, seasonP);

      let incomes, target;
      if (mode === 'day') {
        incomes = open.map(() => randIn(dMin * f, dMax * f, rng, STEP));
        target = round2(incomes.reduce((a, b) => a + b, 0));
      } else {
        target = Number(monthlyRevenue[month]) > 0 ? Number(monthlyRevenue[month]) : randTarget(mMin * f, mMax * f, rng);
        incomes = target > 0 ? split(target, open.map((d) => dayWeight(d, rng, boost, jitter))) : [];
      }
      if (target <= 0) continue;

      incomes.forEach((income, i) => {
        if (income <= 0) return;
        // แตกยอดวันเป็นหลายรายการ แต่ละรายการอย่างน้อย ~100 บาท (กันเศษปัดเป็นลบ)
        const n = Math.max(1, Math.min(Math.round(tMin + (tMax - tMin) * rng()), Math.floor(income / 100), 6));
        const parts = n > 1 ? split(income, Array.from({ length: n }, () => 0.6 + 0.8 * rng())) : [income];
        for (const v of parts) rows.push({ date: open[i], name: pick(plan.revenue, rng).name, income: v, expense: 0 });
      });

      for (const e of plan.expenses) {
        const total = round2((target * e.pct * scale) / 100);
        let dates;
        if (e.freq === 'daily') dates = open;
        else if (e.freq === 'weekly') {
          const gap = Math.max(1, Math.round(open.length / 4));
          dates = open.filter((_, i) => i % gap === 0).slice(0, 4);
        } else {
          const want = `${month}-${String(e.day).padStart(2, '0')}`;
          dates = days.includes(want) ? [want] : [];
        }
        if (!dates.length || total <= 0) continue;
        const w = e.freq === 'monthly' ? [1] : dates.map(() => 0.6 + 0.8 * rng());
        split(total, w).forEach((expense, i) => rows.push({ date: dates[i], name: e.name, income: 0, expense }));
      }
    }
    return sortRows(rows);
  }

  /** เรียงตามวันที่ คงลำดับเดิมในวันเดียวกัน (FR-TBL-020) */
  const sortRows = (rows) =>
    rows.map((r, i) => [r, i]).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]).map((x) => x[0]);

  /** ย้ายแถวที่ from ไปวางที่ตำแหน่ง to (นับหลังดึงแถวออกแล้ว) · วันที่เปลี่ยนเป็นวันของแถวบนที่วางแทรก ไม่มีแถวบนใช้แถวล่าง → ตารางยังเรียงตามวันที่ */
  function moveRow(rows, from, to) {
    const out = rows.slice();
    const [row] = out.splice(from, 1);
    const ref = out[to - 1] || out[to];
    out.splice(to, 0, ref ? { ...row, date: ref.date } : row);
    return out;
  }

  /** คืนยอดคงเหลือทีละแถว (FR-TBL-030) */
  function balances(rows, opening = 0) {
    let bal = Number(opening) || 0;
    return rows.map((r) => (bal = round2(bal + (Number(r.income) || 0) - (Number(r.expense) || 0))));
  }

  function totals(rows, opening = 0) {
    const income = round2(rows.reduce((a, r) => a + (Number(r.income) || 0), 0));
    const expense = round2(rows.reduce((a, r) => a + (Number(r.expense) || 0), 0));
    return { income, expense, balance: round2((Number(opening) || 0) + income - expense), count: rows.length };
  }

  /** BR-010/020: แปลงค่าที่พิมพ์เป็นจำนวนเงินที่ใช้ได้ (≥ 0 ทศนิยม ≤ 2) */
  const toMoney = (v) => {
    const n = Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? round2(n) : 0;
  };

  return { MAX_DAYS, seeded, eachDay, weekday, monthsIn, dayCount, split, generate, expectedRevenue, sortRows, moveRow, balances, totals, toMoney, round2 };
});
