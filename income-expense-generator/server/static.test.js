/* ตรวจจากไฟล์ในโปรเจกต์ (NFR-SEC-010/020 · TC-SEC-002 · ข้อกำหนดไม่มี dependency ฝั่งรัน) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

test('NFR_SEC_010 · TC-SEC-002: .gitignore ปิดบัง .env และ .env.example ไม่มีคีย์จริง', () => {
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('.gitignore'), /^node_modules\/$/m);
  const example = read('.env.example');
  assert.ok(!/^TYPHOON_API_KEY[ 	]*=[ 	]*\S/m.test(example), 'ค่าคีย์ในตัวอย่างต้องว่าง');
});

test('NFR_SEC_020 · TC-SEC-014/016/020: โค้ดหน้าเว็บไม่ใส่ข้อความผู้ใช้/AI ลง innerHTML (มีแต่สตริงคงที่) · ไม่ใช้ eval/document.write', () => {
  const app = read('public', 'app.js');
  const uses = [...app.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1]);
  assert.ok(uses.length >= 1);
  for (const expr of uses) {
    const rest = expr.replace(/'(?:[^'\\]|\\.)*'/g, '').replace(/[+\s]/g, '');
    assert.equal(rest, '', `innerHTML รับค่าที่ไม่ใช่สตริงคงที่: ${expr.slice(0, 60)}`);
  }
  for (const f of fs.readdirSync(path.join(root, 'public')).filter((x) => x.endsWith('.js') && !x.includes('test'))) {
    const src = read('public', f);
    assert.ok(!/\beval\s*\(|document\.write\s*\(|insertAdjacentHTML|outerHTML\s*=/.test(src), f);
  }
});

test('ไม่มี dependency ฝั่งรัน (zero dependency) · SheetJS โหลดจาก cdnjs เวอร์ชัน 0.18.5 · คีย์ไม่อยู่ในไฟล์หน้าเว็บ', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.match(read('public', 'index.html'), /cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\//);
  for (const f of ['app.js', 'index.html', 'plan.js']) assert.ok(!/tk-|Bearer|TYPHOON_API_KEY/.test(read('public', f)), f);
});

test('npm test รันทุกไฟล์ test ด้วยคำสั่งเดียว', () => {
  assert.match(JSON.parse(read('package.json')).scripts.test, /node --test/);
});
