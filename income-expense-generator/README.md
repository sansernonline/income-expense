# Income & Expense Generator (IEGEN)

เว็บแอปสร้างรายการรายรับรายจ่ายจำลองของธุรกิจเล็ก ๆ เลือกประเภทธุรกิจ (8 แบบสำเร็จรูปหรือพิมพ์เอง) แล้วได้หมวดและช่วงรายรับให้ทันที ปรับตัวเลข แก้ตาราง ส่งออก Excel ได้ ตัวเลขทุกตัวเป็นข้อมูลจำลอง

- ปุ่ม "ให้ AI ปรับหมวด" ใช้ Typhoon AI ถ้าไม่ตั้งคีย์หรือ AI ล้ม แอปคงหมวดเดิม
- ตั้ง login บัญชีเดียวแล้วแอปจะขึ้นหน้า login ก่อนใช้ (เซิร์ฟเวอร์ปิด `/api/plan` และ `/api/ledgers` ถ้ายังไม่ login) · ไม่ตั้งก็ใช้ได้เลยโดยไม่มีหน้า login แต่ปุ่ม "บันทึก / เปิด" ใช้ไม่ได้
- ปุ่ม "บันทึก / เปิด" บันทึกชุดรายรับรายจ่ายลง SQLite และสำรองไป Backblaze B2 ได้
- AI คืนแค่แผน (หมวด ร้อยละ ความถี่) วันที่และจำนวนเงินโค้ดวางเอง รายรับรวมต่อเดือนจึงตรงเป้า · ส่งไป AI เฉพาะข้อความประเภทธุรกิจ

## รัน

ต้องใช้ Node 22 ขึ้นไป ตัวแอปไม่มี dependency

```bash
cp .env.example .env     # ใส่ TYPHOON_API_KEY ถ้าจะใช้ปุ่ม AI (ไม่ใส่ก็ใช้ได้)
npm start                # เปิด http://127.0.0.1:3000
npm run dev              # เหมือน start แต่รีสตาร์ตเองเมื่อแก้ไฟล์ฝั่งเซิร์ฟเวอร์
```

แก้ไฟล์ใน `public/` ไม่ต้องรีสตาร์ต แค่รีเฟรชหน้า · ปุ่มส่งออก Excel โหลด SheetJS จาก cdnjs จึงต้องต่ออินเทอร์เน็ต

## เทสต์

```bash
npm install              # ครั้งแรก ลง playwright-core
npm test                 # 212 เทสต์ ใช้เวลาราว 1–2 นาที
node --test server/b2.test.js   # รันไฟล์เดียว
```

เทสต์ `public/app-*.test.js` เปิดหน้าจริงในเบราว์เซอร์ จึงต้องมี Chromium ของ Playwright (`npx playwright install chromium`) หรือชี้ไฟล์เบราว์เซอร์ด้วย `IEGEN_CHROME` · หาไม่เจอ ชุดนี้จะข้าม ชุดอื่นยังรัน · Typhoon และ B2 ในเทสต์เป็นตัวจำลอง ไม่เรียกของจริง

## ค่าตั้ง (.env)

| ค่า | ใช้ทำอะไร | ค่าตั้งต้น |
|---|---|---|
| `TYPHOON_API_KEY` | คีย์จาก https://playground.opentyphoon.ai | ว่าง (ปุ่ม AI ใช้ไม่ได้) |
| `TYPHOON_MODEL` · `TYPHOON_BASE_URL` | โมเดลและปลายทาง | `typhoon-v2.5-30b-a3b-instruct` · `https://api.opentyphoon.ai/v1` |
| `PORT` · `HOST` | พอร์ตและที่อยู่ที่รับ | `3000` · `127.0.0.1` |
| `RATE_LIMIT_PER_MIN` | จำนวนครั้งที่ 1 IP เรียก AI ได้ต่อนาที | `10` |
| `TRUST_PROXY` | ตั้ง `1` เมื่ออยู่หลัง proxy ให้นับ IP จาก `X-Forwarded-For` | ปิด |
| `IEGEN_LOGIN_USER` `IEGEN_LOGIN_PASSWORD_HASH` `IEGEN_SESSION_SECRET` | login บัญชีเดียว ต้องตั้งครบ 3 ตัว (ดูหัวข้อ login) | ว่าง (ไม่มีหน้า login และปิดประวัติ) |
| `DATA_DIR` | โฟลเดอร์เก็บ SQLite | `data/` |
| `B2_ENDPOINT` `B2_BUCKET` `B2_KEY_ID` `B2_APPLICATION_KEY` | สำรองไป B2 ต้องตั้งครบ 4 ตัว | ว่าง (ไม่สำรอง) |
| `B2_OBJECT_KEY` · `B2_REGION` | ชื่อไฟล์บน bucket · region เมื่ออ่านจาก endpoint ไม่ได้ | `iegen/iegen.sqlite` |

ค่าลับอยู่ใน `.env` ฝั่งเซิร์ฟเวอร์ ไม่ส่งถึงเบราว์เซอร์ และ `.env` ไม่เข้า git

## login

ตั้งชื่อผู้ใช้ รหัสผ่าน และความลับของเซสชันใน `.env` (หรือ Render Dashboard):

```bash
npm run password-hash    # พิมพ์รหัสผ่านแล้วกด Enter
```

คำสั่งพิมพ์ 2 บรรทัด `IEGEN_LOGIN_PASSWORD_HASH=...` และ `IEGEN_SESSION_SECRET=...` ให้คัดลอกไป `.env` พร้อมเติม `IEGEN_LOGIN_USER=ชื่อที่ต้องการ` · แนะนำรหัสผ่านอย่างน้อย 15 ตัวอักษร · ค่าที่ได้เก็บแค่แฮช ไม่เก็บรหัสจริง

- เข้าระบบแล้วเซิร์ฟเวอร์ตั้งคุกกี้ `iegen_session` (HttpOnly) อยู่ 12 ชั่วโมง หรือ 30 วันถ้าติ๊ก "จำฉันไว้" · ไม่มีที่เก็บเซสชันฝั่งเซิร์ฟเวอร์
- รหัสผิด 5 ครั้งใน 15 นาที ล็อก IP นั้น และผิดรวมทุก IP 50 ครั้ง ล็อกทั้งหมด 15 นาที
- ลืมรหัสผ่านหรืออยากให้ทุกเครื่องออกจากระบบ ให้สร้างค่าใหม่ด้วยคำสั่งข้างบน แล้วเปลี่ยนใน env (เปลี่ยน `IEGEN_SESSION_SECRET` อย่างเดียวก็ทำให้ทุกคนต้องเข้าใหม่)
- ตั้งไม่ครบ 3 ตัว หรือ `IEGEN_SESSION_SECRET` สั้นกว่า 32 ตัวอักษร เซิร์ฟเวอร์จะไม่เปิด

## สำรองไป Backblaze B2

ตั้ง `B2_*` ครบ 4 ตัว แอปจะส่งไฟล์ SQLite ไป bucket หลังบันทึกหรือลบทุกครั้ง และดึงไฟล์ล่าสุดมาถ้าเครื่องไม่มีไฟล์ (Render แผนฟรีล้างดิสก์ทุกครั้งที่ deploy) · ดึงไม่สำเร็จจะตอบ 503 ไม่เปิดฐานว่างมาทับไฟล์บน B2 · ตั้งไม่ครบ หรือ endpoint ไม่ใช่ https เซิร์ฟเวอร์จะไม่เปิด

1. สร้าง bucket แบบ Private
2. สร้าง application key จำกัดเฉพาะ bucket นี้ สิทธิ์ `listFiles` `readFiles` `writeFiles` (คีย์แสดงครั้งเดียว)
3. `B2_ENDPOINT` ดูในหน้า bucket (รูปแบบ `https://s3.<region>.backblazeb2.com`)
4. B2 เก็บทุกเวอร์ชันของไฟล์ ถ้าอยากจำกัดพื้นที่ ตั้งกฎ lifecycle ที่ prefix `iegen/`

## ขึ้น Render

`../render.yaml` เป็น Blueprint: แผนฟรี · Singapore · health check `/healthz` · ตั้ง `HOST` และ `TRUST_PROXY` ไว้แล้ว

Render Dashboard → New → Blueprint → เลือก repo นี้ แล้วใส่ค่าลับ (`TYPHOON_API_KEY` `IEGEN_LOGIN_*` `B2_*`) ใน Dashboard

## โครงโค้ด

| ที่ | หน้าที่ |
|---|---|
| `server/server.js` | เสิร์ฟหน้าเว็บ · `/healthz` · `POST /api/plan` |
| `server/typhoon.js` | ตัวเชื่อม Typhoon (หมดเวลา 40 วินาที ลองซ้ำ 1 ครั้ง) |
| `server/auth.js` | login: แฮชรหัสผ่าน (scrypt) · คุกกี้เซสชัน · ล็อกเมื่อรหัสผิด (`/api/login` `/api/logout` `/api/session`) |
| `server/history.js` · `store.js` · `b2.js` | ประวัติ (`/api/ledgers`) · SQLite · สำรอง B2 |
| `public/presets.js` · `plan.js` · `ledger.js` | ประเภทธุรกิจ · ตรวจแผนจาก AI · สร้างรายการและยอดคงเหลือ |
| `public/app.js` · `login.js` · `history.js` · `index.html` · `styles.css` | หน้าจอ (`login.js` = หน้า login) |
| `test-kit/` · `scripts/` | ตัวช่วยเทสต์ · `build-mockup.js` สร้าง `../mockup/IEGEN-mockup.html` · `password-hash.js` สร้างค่า login |

เอกสารอื่นอยู่ที่ `../docs/` (BRIEF · SRS · DECISIONS · BUILD-PLAN)
