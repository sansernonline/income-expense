/* สร้างค่า IEGEN_LOGIN_PASSWORD_HASH กับ IEGEN_SESSION_SECRET สำหรับ .env
   รับรหัสผ่านทาง stdin ไม่รับทาง argument กันไม่ให้ค้างใน history ของ shell: npm run password-hash แล้วพิมพ์รหัส Enter
   รูปแบบ scrypt:<salt hex>:<hash hex> ต้องตรงกับ server/auth.js (ใช้ฟังก์ชันเดียวกัน) */
const { randomBytes } = require('node:crypto');
const { createInterface } = require('node:readline');
const { hashPassword } = require('../server/auth.js');

const rl = createInterface({ input: process.stdin, terminal: false });
if (process.stdin.isTTY) process.stderr.write('พิมพ์รหัสผ่านแล้วกด Enter (ตัวอักษรจะแสดงบนจอ ล้างจอหลังใช้): ');
rl.once('line', async (password) => {
  rl.close();
  if (!password) { console.error('ไม่ได้รหัสผ่าน'); process.exit(1); }
  if (password.length < 15) console.error('คำเตือน: รหัสผ่านสั้นกว่า 15 ตัวอักษร (NIST SP 800-63B แนะนำ 15 ขึ้นไปเมื่อไม่มีปัจจัยที่สอง)');
  console.log(`IEGEN_LOGIN_PASSWORD_HASH=${await hashPassword(password)}`);
  console.log(`IEGEN_SESSION_SECRET=${randomBytes(32).toString('hex')}`);
  console.error('คัดลอก 2 บรรทัดบนไป .env พร้อม IEGEN_LOGIN_USER=<ชื่อผู้ใช้> · เปลี่ยน IEGEN_SESSION_SECRET เมื่อไรทุกคนต้องเข้าระบบใหม่');
});
rl.once('close', () => { /* stdin ว่าง: ไม่มีบรรทัดให้อ่าน */ });
