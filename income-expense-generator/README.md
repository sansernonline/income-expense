# Income & Expense (รหัสโปรเจกต์ IEGEN)

แอปหน้าเดียว ตารางอยู่ซ้าย แผงตั้งค่าอยู่ขวา เลือกประเภทธุรกิจก่อน แล้วระบบเติมหมวดรายรับรายจ่ายให้ตามประเภทนั้น (ปรับ % ได้ ตั้งกำไรเป้าหมาย เดือนขายดี/ซบเซา จำนวนรายการต่อวัน ล็อกผลสุ่มได้) แก้ ลบ เพิ่มรายการในตารางได้ ส่งออก Excel ได้ ปุ่ม “ให้ AI ปรับหมวด” ต่อ Typhoon AI

หน้าตา: ลอกธีมจาก `Bill Gen - Thai Receipt Generator/mockup/BILLGEN-mockup.html` · ต้นแบบที่กดได้: `../mockup/IEGEN-mockup.html` (สร้างใหม่ด้วย `node scripts/build-mockup.js`)

## ใช้งาน

```bash
cp .env.example .env     # ใส่ TYPHOON_API_KEY (ไม่ใส่ก็ใช้ได้ จะใช้แม่แบบกลาง)
npm start                # เปิด http://127.0.0.1:3000
npm test                 # เทสต์ทั้งหมดใน public/ และ server/
```

ต้องใช้ Node 22 ขึ้นไป · ตัวแอปไม่มี dependency · ปุ่มส่งออก Excel โหลดตัวสร้างไฟล์ SheetJS 0.18.5 จาก cdnjs ตอนเปิดหน้า (ต้องต่ออินเทอร์เน็ต)

เทสต์ `public/app-*.test.js` เปิดหน้าจริงในเบราว์เซอร์ จึงต้อง `npm install` เพื่อลง `playwright-core` (devDependency ตัวเดียว) และต้องมี Chromium ที่ Playwright ติดตั้งไว้ในเครื่อง หรือชี้ไฟล์เบราว์เซอร์เองด้วย `IEGEN_CHROME` · ถ้าหาไม่เจอ เทสต์ชุดนี้จะข้าม ส่วนชุดอื่นยังรันตามปกติ

ค่าตั้งอื่นที่ใช้ได้: `PORT` (ค่าตั้งต้น 3000) · `HOST` (ค่าตั้งต้น 127.0.0.1) · `RATE_LIMIT_PER_MIN` (ค่าตั้งต้น 10) · `TRUST_PROXY=1` ให้นับ IP จาก `X-Forwarded-For` · `DATA_DIR` (ค่าตั้งต้น `data/`)

## โครง

| ที่ | หน้าที่ |
|---|---|
| `server/server.js` | เสิร์ฟหน้าเว็บ · `GET /healthz` · `POST /api/plan` (ตัวคำขอไม่เกิน 10 KB · IP ละ 10 ครั้งต่อนาที) · รับที่ 127.0.0.1 เว้นแต่ตั้ง `HOST` |
| `server/history.js` | `/api/ledgers` บันทึก เปิด ลบ ชุดรายรับรายจ่าย (ชุดละไม่เกิน 2 MB และ 20,000 แถว) · ตรวจรหัส `APP_PASSWORD` · ใส่ผิด 10 ครั้งใน 15 นาทีล็อก IP นั้น · ผิดรวมทุก IP 50 ครั้งล็อกทั้งหมด 15 นาที |
| `server/store.js` | ฐานข้อมูล SQLite (`node:sqlite` มากับ Node 22) ตาราง `ledgers` |
| `server/b2.js` | ส่งและดึงไฟล์ SQLite กับ Backblaze B2 ผ่าน S3 API (ลายเซ็น v4 เขียนเอง) |
| `public/history.js` | หน้าต่าง "ประวัติ" |
| `server/typhoon.js` | ตัวเชื่อม Typhoon · ลองซ้ำ 1 ครั้ง · หมดเวลา 40 วินาที · ล้มแล้วใช้แม่แบบกลาง |
| `public/plan.js` | แม่แบบกลาง + ตรวจ/ทำความสะอาดแผนจาก AI |
| `public/presets.js` | ประเภทธุรกิจสำเร็จรูป: หมวดรายรับ หมวดรายจ่าย และช่วงรายรับตั้งต้น (ตัวเลขเป็นค่าสมมติ รอยืนยัน) |
| `public/ledger.js` | สร้างรายการ · คงเหลือ · ยอดรวม (ฟังก์ชันล้วน มีเทสต์ข้างไฟล์) |
| `public/app.js` · `index.html` · `styles.css` | หน้าจอ |
| `test-kit/e2e-kit.js` | ตัวช่วยของเทสต์ที่เปิดเบราว์เซอร์ เปิดเซิร์ฟเวอร์จริงที่พอร์ตสุ่ม ส่วน Typhoon ใช้ตัวจำลอง |
| `scripts/build-mockup.js` | สร้าง `../mockup/IEGEN-mockup.html` ไฟล์เดียวจากโค้ดแอป (Typhoon และ `/api/ledgers` เป็นตัวจำลอง) |

## ประวัติและการสำรองไป Backblaze B2

ปุ่ม "ประวัติ" บนแถบตาราง บันทึกชุดปัจจุบัน (ตั้งค่า หมวด ตาราง) ลง SQLite ที่ `data/iegen.sqlite` เปิดชุดเก่ากลับมา หรือลบได้ · ใช้ได้เมื่อตั้ง `APP_PASSWORD` · หน้าเว็บจำรหัสไว้ในเบราว์เซอร์นั้นจนกด "ออกจากระบบในเครื่องนี้"

ตั้ง `B2_ENDPOINT` `B2_BUCKET` `B2_KEY_ID` `B2_APPLICATION_KEY` ครบ 4 ตัว แอปจะส่งไฟล์ทั้งก้อนไปที่ `iegen/iegen.sqlite` ใน bucket หลังบันทึกหรือลบทุกครั้ง และถ้าเครื่องไม่มีไฟล์ (Render แผนฟรีล้างดิสก์ทุกครั้งที่ deploy หรือรีสตาร์ต) จะดึงไฟล์ล่าสุดมาก่อนเปิดฐานข้อมูล · ดึงไม่สำเร็จจะตอบ 503 และไม่เปิดฐานว่าง เพื่อไม่ให้ส่งฐานว่างไปทับไฟล์บน B2

ถ้าไม่ตั้งเลยสักตัว แอปจะไม่สำรอง ส่วนถ้าตั้งไม่ครบ 4 ตัว หรือ `B2_ENDPOINT` ไม่ใช่ https เซิร์ฟเวอร์จะไม่เปิด · ตั้งเพิ่มได้ 2 ตัว: `B2_OBJECT_KEY` เปลี่ยนชื่อไฟล์บน bucket และ `B2_REGION` ใช้เมื่อแอปอ่าน region จาก endpoint ไม่ได้

ตั้งฝั่ง Backblaze:
1. สร้าง bucket แบบ Private
2. สร้าง application key จำกัดเฉพาะ bucket นี้ สิทธิ์ `listFiles` `readFiles` `writeFiles` (ไม่ต้องมี `deleteFiles`) · คีย์แสดงครั้งเดียว ใส่ใน Render Dashboard ทันที
3. `B2_ENDPOINT` ดูได้ในหน้า bucket (รูปแบบ `https://s3.<region>.backblazeb2.com`)
4. B2 เก็บทุกเวอร์ชันของไฟล์ชื่อเดิม ทุกครั้งที่บันทึกจึงเพิ่มอีกเวอร์ชัน ใช้ย้อนกลับได้ แต่คิดเป็นพื้นที่เก็บด้วย · ถ้าอยากจำกัด ตั้งกฎ lifecycle ที่ prefix `iegen/` เช่น "Keep prior versions for this number of days"

ทดสอบ: `node --test server/b2.test.js server/history.test.js public/app-hist.test.js` (B2 จำลองในเครื่อง ไม่เรียกของจริง)

## ขึ้น Render

`../render.yaml` ที่รากโปรเจกต์เป็น Blueprint ของ Render: แผนฟรี · ภูมิภาค Singapore · `rootDir` ชี้มาที่โฟลเดอร์นี้ · health check ที่ `/healthz` · ตั้ง `HOST=0.0.0.0` และ `TRUST_PROXY=1` ไว้แล้ว · ค่าลับ (`TYPHOON_API_KEY` `APP_PASSWORD` `B2_*`) ใส่ใน Render Dashboard ไม่เขียนลงไฟล์ · วิธีใช้: Render Dashboard → New → Blueprint → เลือก repo นี้

หลักคิด: AI คืน "แผน" (หมวด · ร้อยละของรายรับ · ความถี่) ส่วนวันที่และจำนวนเงินโค้ดวางเอง เพื่อให้รายรับรวมต่อเดือนตรงเป้าพอดี · ส่งไป AI เฉพาะข้อความประเภทธุรกิจ
