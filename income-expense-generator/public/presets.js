/* ประเภทธุรกิจสำเร็จรูป: หมวดรายรับ หมวดรายจ่าย (% ของรายรับ) และช่วงรายรับตั้งต้น
   ตัวเลขทุกตัวเป็นค่าสมมติ (รอยืนยัน) ไว้เป็นจุดเริ่ม ผู้ใช้ปรับได้ทั้งหมดในแผงตั้งค่า
   รูปแบบหมวดตรงกับ sanitizePlan ใน plan.js */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IE = Object.assign(root.IE || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  const PRESETS = [
    {
      id: 'coffee', label: 'ร้านกาแฟ',
      income: { monthMin: 100000, monthMax: 140000, dayMin: 3000, dayMax: 5000 },
      revenue: [{ name: 'ขายกาแฟและเครื่องดื่ม', weight: 70 }, { name: 'ขายเบเกอรี่และขนม', weight: 25 }, { name: 'ขายเมล็ดกาแฟ', weight: 5 }],
      expenses: [
        { name: 'ซื้อเมล็ดกาแฟ นม วัตถุดิบ', pct: 28, freq: 'weekly' },
        { name: 'แก้วและบรรจุภัณฑ์', pct: 4, freq: 'weekly' },
        { name: 'ค่าแรงพนักงาน', pct: 18, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่', pct: 12, freq: 'monthly', day: 1 },
        { name: 'ค่าน้ำ ค่าไฟ', pct: 6, freq: 'monthly', day: 5 },
        { name: 'ซ่อมเครื่องชงและค่าแก๊ส', pct: 2, freq: 'monthly', day: 15 },
        { name: 'ค่าใช้จ่ายจิปาถะ', pct: 2, freq: 'daily' },
      ],
    },
    {
      id: 'food', label: 'ร้านอาหารตามสั่ง',
      income: { monthMin: 120000, monthMax: 180000, dayMin: 4000, dayMax: 6500 },
      revenue: [{ name: 'ขายอาหารหน้าร้าน', weight: 65 }, { name: 'ขายเดลิเวอรี', weight: 25 }, { name: 'ขายเครื่องดื่ม', weight: 10 }],
      expenses: [
        { name: 'ซื้อวัตถุดิบสด', pct: 22, freq: 'daily' },
        { name: 'ค่าใช้จ่ายจิปาถะ', pct: 2, freq: 'daily' },
        { name: 'ซื้อวัตถุดิบแห้งและของใช้', pct: 8, freq: 'weekly' },
        { name: 'ค่าแก๊สหุงต้ม', pct: 4, freq: 'weekly' },
        { name: 'ค่าธรรมเนียมแอปเดลิเวอรี', pct: 3, freq: 'weekly' },
        { name: 'ค่าแรงพนักงาน', pct: 15, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่', pct: 8, freq: 'monthly', day: 1 },
        { name: 'ค่าน้ำ ค่าไฟ', pct: 5, freq: 'monthly', day: 5 },
      ],
    },
    {
      id: 'online', label: 'ขายของออนไลน์',
      income: { monthMin: 150000, monthMax: 250000, dayMin: 5000, dayMax: 8500 },
      revenue: [{ name: 'ยอดขาย Shopee', weight: 45 }, { name: 'ยอดขาย TikTok Shop', weight: 30 }, { name: 'ยอดขาย LINE และ Facebook', weight: 25 }],
      expenses: [
        { name: 'ซื้อสินค้าเข้าสต็อก', pct: 45, freq: 'weekly' },
        { name: 'ค่าธรรมเนียมแพลตฟอร์ม', pct: 8, freq: 'weekly' },
        { name: 'ค่าขนส่งพัสดุ', pct: 7, freq: 'weekly' },
        { name: 'ค่าโฆษณา', pct: 8, freq: 'monthly', day: 15 },
        { name: 'ค่าแรงแอดมิน', pct: 8, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่เก็บของ', pct: 3, freq: 'monthly', day: 1 },
        { name: 'ค่าอินเทอร์เน็ต', pct: 1, freq: 'monthly', day: 5 },
      ],
    },
    {
      id: 'garage', label: 'อู่ซ่อมรถ',
      income: { monthMin: 200000, monthMax: 300000, dayMin: 7000, dayMax: 11000 },
      revenue: [{ name: 'ค่าแรงซ่อม', weight: 50 }, { name: 'ขายอะไหล่', weight: 40 }, { name: 'น้ำมันเครื่องและของเหลว', weight: 10 }],
      expenses: [
        { name: 'ซื้ออะไหล่', pct: 30, freq: 'weekly' },
        { name: 'ซื้อน้ำมันเครื่องและสารหล่อลื่น', pct: 8, freq: 'weekly' },
        { name: 'ค่าแรงช่าง', pct: 18, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่', pct: 6, freq: 'monthly', day: 1 },
        { name: 'ค่าน้ำ ค่าไฟ', pct: 4, freq: 'monthly', day: 5 },
        { name: 'ซ่อมบำรุงเครื่องมือ', pct: 3, freq: 'monthly', day: 20 },
        { name: 'ค่าใช้จ่ายจิปาถะ', pct: 1, freq: 'daily' },
      ],
    },
    {
      id: 'dorm', label: 'หอพักให้เช่า',
      income: { monthMin: 90000, monthMax: 120000, dayMin: 3000, dayMax: 4000 },
      revenue: [{ name: 'ค่าเช่าห้อง', weight: 80 }, { name: 'ค่าน้ำ ค่าไฟที่เก็บจากผู้เช่า', weight: 18 }, { name: 'ค่าบริการอื่น', weight: 2 }],
      expenses: [
        { name: 'ค่าน้ำประปา ค่าไฟฟ้า (จ่ายจริง)', pct: 14, freq: 'monthly', day: 5 },
        { name: 'ค่าแม่บ้านและ รปภ.', pct: 10, freq: 'monthly', day: 28 },
        { name: 'ซ่อมบำรุงห้องพัก', pct: 6, freq: 'monthly', day: 15 },
        { name: 'ค่าอินเทอร์เน็ตและส่วนกลาง', pct: 3, freq: 'monthly', day: 5 },
        { name: 'ภาษีที่ดินและประกัน', pct: 3, freq: 'monthly', day: 20 },
      ],
    },
    {
      id: 'freelance', label: 'ฟรีแลนซ์ออกแบบ',
      income: { monthMin: 40000, monthMax: 90000, dayMin: 1500, dayMax: 3500 },
      revenue: [{ name: 'งานออกแบบโลโก้', weight: 40 }, { name: 'งานคอนเทนต์โซเชียล', weight: 40 }, { name: 'งานแก้ไขเพิ่มเติม', weight: 20 }],
      expenses: [
        { name: 'ค่าเดินทางพบลูกค้า', pct: 3, freq: 'weekly' },
        { name: 'ค่าอาหารและจิปาถะ', pct: 4, freq: 'weekly' },
        { name: 'ซอฟต์แวร์และสมาชิกรายเดือน', pct: 6, freq: 'monthly', day: 1 },
        { name: 'ค่าอินเทอร์เน็ตและโทรศัพท์', pct: 3, freq: 'monthly', day: 5 },
        { name: 'ค่าไฟและที่ทำงาน', pct: 6, freq: 'monthly', day: 5 },
        { name: 'ซื้ออุปกรณ์และฟอนต์', pct: 4, freq: 'monthly', day: 15 },
        { name: 'ค่าบัญชีและภาษี', pct: 4, freq: 'monthly', day: 25 },
      ],
    },
    {
      id: 'retail', label: 'ร้านขายของชำ',
      income: { monthMin: 150000, monthMax: 220000, dayMin: 5000, dayMax: 7500 },
      revenue: [{ name: 'ขายสินค้าอุปโภคบริโภค', weight: 70 }, { name: 'ขายเครื่องดื่มและขนม', weight: 20 }, { name: 'บริการเติมเงินและจ่ายบิล', weight: 10 }],
      expenses: [
        { name: 'ซื้อสินค้าเข้าร้าน', pct: 60, freq: 'weekly' },
        { name: 'ค่าใช้จ่ายจิปาถะ', pct: 1, freq: 'daily' },
        { name: 'ค่าแรงพนักงาน', pct: 8, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่', pct: 5, freq: 'monthly', day: 1 },
        { name: 'ค่าน้ำ ค่าไฟ', pct: 4, freq: 'monthly', day: 5 },
      ],
    },
    {
      id: 'salon', label: 'ร้านเสริมสวย',
      income: { monthMin: 80000, monthMax: 130000, dayMin: 2500, dayMax: 4500 },
      revenue: [{ name: 'ค่าบริการตัดและทำผม', weight: 55 }, { name: 'ค่าบริการทำสีและดัด', weight: 30 }, { name: 'ขายผลิตภัณฑ์ดูแลผม', weight: 15 }],
      expenses: [
        { name: 'ซื้อน้ำยาและวัสดุ', pct: 15, freq: 'weekly' },
        { name: 'ค่าใช้จ่ายจิปาถะ', pct: 2, freq: 'daily' },
        { name: 'ค่าแรงช่างและค่าคอมมิชชัน', pct: 30, freq: 'monthly', day: 28 },
        { name: 'ค่าเช่าที่', pct: 10, freq: 'monthly', day: 1 },
        { name: 'ค่าน้ำ ค่าไฟ', pct: 6, freq: 'monthly', day: 5 },
      ],
    },
  ];

  return { PRESETS };
});
