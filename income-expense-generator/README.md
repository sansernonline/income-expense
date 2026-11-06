# Income & Expense (รหัสโปรเจกต์ IEGEN)

แอปหน้าเดียว ตารางอยู่ซ้าย แผงตั้งค่าอยู่ขวา เลือกประเภทธุรกิจก่อน แล้วระบบเติมหมวดรายรับรายจ่ายให้ตามประเภทนั้น (ปรับ % ได้ ตั้งกำไรเป้าหมาย เดือนขายดี/ซบเซา จำนวนรายการต่อวัน ล็อกผลสุ่มได้) แก้ ลบ เพิ่มรายการในตารางได้ ส่งออก Excel ได้ ปุ่ม “ให้ AI ปรับหมวด” ต่อ Typhoon AI

หน้าตา: ลอกธีมจาก `Bill Gen - Thai Receipt Generator/mockup/BILLGEN-mockup.html` · ต้นแบบที่กดได้: `../mockup/IEGEN-mockup.html` (สร้างใหม่ด้วย `node scripts/build-mockup.js`)

## ใช้งาน

```bash
cp .env.example .env     # ใส่ TYPHOON_API_KEY (ไม่ใส่ก็ใช้ได้ จะใช้แม่แบบกลาง)
node server/server.js    # เปิด http://127.0.0.1:3000
node --test public/ledger.test.js
```

ต้องใช้ Node 22 ขึ้นไป ไม่มี dependency · ปุ่มส่งออก Excel โหลดตัวสร้างไฟล์ SheetJS 0.18.5 จาก cdnjs ตอนเปิดหน้า (ต้องต่ออินเทอร์เน็ต)

## โครง

| ที่ | หน้าที่ |
|---|---|
| `server/server.js` | เสิร์ฟหน้าเว็บ + `POST /api/plan` (ผูก 127.0.0.1 · จำกัด 10 KB) |
| `server/history.js` | `/api/ledgers` บันทึก เปิด ลบ ชุดรายรับรายจ่าย · ตรวจรหัส `APP_PASSWORD` · ใส่ผิด 10 ครั้งใน 15 นาทีล็อก IP นั้น |
| `server/store.js` | ฐานข้อมูล SQLite (`node:sqlite` มากับ Node 22) ตาราง `ledgers` |
| `server/b2.js` | ส่งและดึงไฟล์ SQLite กับ Backblaze B2 ผ่าน S3 API (ลายเซ็น v4 เขียนเอง) |
| `public/history.js` | หน้าต่าง "ประวัติ" |
| `server/typhoon.js` | ตัวเชื่อม Typhoon · ลองซ้ำ 1 ครั้ง · หมดเวลา 40 วินาที · ล้มแล้วใช้แม่แบบกลาง |
| `public/plan.js` | แม่แบบกลาง + ตรวจ/ทำความสะอาดแผนจาก AI |
| `public/ledger.js` | สร้างรายการ · คงเหลือ · ยอดรวม (ฟังก์ชันล้วน มีเทสต์ข้างไฟล์) |
| `public/app.js` · `index.html` · `styles.css` | หน้าจอ |

## ประวัติและการสำรองไป Backblaze B2

ปุ่ม "ประวัติ" บนแถบตาราง บันทึกชุดปัจจุบัน (ตั้งค่า หมวด ตาราง) ลง SQLite ที่ `data/iegen.sqlite` เปิดชุดเก่ากลับมา หรือลบได้ · ใช้ได้เมื่อตั้ง `APP_PASSWORD` · หน้าเว็บจำรหัสไว้ในเบราว์เซอร์นั้นจนกด "ออกจากระบบในเครื่องนี้"

ตั้ง `B2_*` ครบ 4 ตัว แอปจะส่งไฟล์ทั้งก้อนไปที่ `iegen/iegen.sqlite` ใน bucket หลังบันทึกหรือลบทุกครั้ง และถ้าเครื่องไม่มีไฟล์ (Render แผนฟรีล้างดิสก์ทุกครั้งที่ deploy หรือรีสตาร์ต) จะดึงไฟล์ล่าสุดมาก่อนเปิดฐานข้อมูล · ดึงไม่สำเร็จจะตอบ 503 และไม่เปิดฐานว่าง เพื่อไม่ให้ส่งฐานว่างไปทับไฟล์บน B2

ตั้งฝั่ง Backblaze:
1. สร้าง bucket แบบ Private
2. สร้าง application key จำกัดเฉพาะ bucket นี้ สิทธิ์ `listFiles` `readFiles` `writeFiles` (ไม่ต้องมี `deleteFiles`) · คีย์แสดงครั้งเดียว ใส่ใน Render Dashboard ทันที
3. `B2_ENDPOINT` ดูได้ในหน้า bucket (รูปแบบ `https://s3.<region>.backblazeb2.com`)
4. B2 เก็บทุกเวอร์ชันของไฟล์ชื่อเดิม ทุกครั้งที่บันทึกจึงเพิ่มอีกเวอร์ชัน ใช้ย้อนกลับได้ แต่คิดเป็นพื้นที่เก็บด้วย · ถ้าอยากจำกัด ตั้งกฎ lifecycle ที่ prefix `iegen/` เช่น "Keep prior versions for this number of days"

ทดสอบ: `node --test server/b2.test.js server/history.test.js public/app-hist.test.js` (B2 จำลองในเครื่อง ไม่เรียกของจริง)

หลักคิด: AI คืน "แผน" (หมวด · ร้อยละของรายรับ · ความถี่) ส่วนวันที่และจำนวนเงินโค้ดวางเอง เพื่อให้รายรับรวมต่อเดือนตรงเป้าพอดี · ส่งไป AI เฉพาะข้อความประเภทธุรกิจ
