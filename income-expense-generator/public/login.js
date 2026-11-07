/* หน้า login: ถ้าเซิร์ฟเวอร์ตั้ง IEGEN_LOGIN_* ไว้ ต้องใส่ชื่อผู้ใช้และรหัสผ่านก่อนใช้แอป · ไม่ตั้ง = ไม่มีหน้านี้
   เซิร์ฟเวอร์ตั้งคุกกี้เซสชัน (HttpOnly) ให้ ฝั่งหน้าเว็บไม่เก็บรหัสไว้เลย */
(function () {
  const $ = (id) => document.getElementById(id);
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  /** ปิดกั้นแอปที่อยู่ด้านหลัง ไม่ให้กด Tab หรืออ่านด้วยโปรแกรมอ่านจอได้ขณะยังไม่ login */
  const shell = () => document.querySelectorAll('body > header, body > nav, body > main');
  let required = false;
  function lock(on) {
    $('login').hidden = !on;
    shell().forEach((el) => { el.inert = on; });
    $('btn-logout').hidden = on || !required;
  }

  function show(msg) {
    required = true;
    lock(true);
    $('login-err').textContent = msg || '';
    ($('login-user').value ? $('login-pass') : $('login-user')).focus();
  }

  /** ถามเซิร์ฟเวอร์ว่าต้อง login ไหม และคุกกี้เดิมยังใช้ได้ไหม */
  async function verify() {
    let r, body = {};
    try { r = await fetch('/api/session'); body = await r.json().catch(() => ({})); } catch (e) { return; } // ต่อเซิร์ฟเวอร์ไม่ได้ ปล่อยแอปทำงานต่อ
    if (r.ok) { required = body.required; return lock(false); }
    if (r.status === 401) show(); // เข้าครั้งแรกหรือคุกกี้หมดอายุ ยังไม่ต้องขึ้นข้อความผิด
  }

  async function submit() {
    const user = $('login-user').value.trim(), password = $('login-pass').value;
    if (!user || !password) return show('ใส่ชื่อผู้ใช้และรหัสผ่านให้ครบ');
    $('login-btn').disabled = true;
    try {
      const r = await post('/api/login', { user, password, remember: $('login-remember').checked });
      const body = await r.json().catch(() => ({}));
      if (r.ok) { required = true; $('login-pass').value = ''; return lock(false); }
      show(body.error || 'เข้าไม่ได้ ลองใหม่อีกครั้ง');
      $('login-pass').select();
    } catch (e) { show('ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'); } finally { $('login-btn').disabled = false; }
  }

  /** คำขอ /api/* ตอบ 401 (คุกกี้หมดอายุหรือความลับถูกเปลี่ยน) → กลับหน้า login */
  const expired = (msg) => show(msg);
  async function logout() { try { await post('/api/logout'); } catch (e) { /* ล้างฝั่งเซิร์ฟเวอร์ไม่ได้ ก็ยังกลับหน้า login */ } $('login-pass').value = ''; show(); }

  function init() {
    $('login-form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    $('login-eye').addEventListener('click', () => {
      const f = $('login-pass'), hide = f.type === 'text';
      f.type = hide ? 'password' : 'text';
      $('login-eye').textContent = hide ? 'แสดง' : 'ซ่อน';
      $('login-eye').setAttribute('aria-pressed', String(!hide));
    });
    $('btn-logout').addEventListener('click', logout);
    return verify();
  }

  window.IE = Object.assign(window.IE || {}, { auth: { init, expired, logout } });
})();
