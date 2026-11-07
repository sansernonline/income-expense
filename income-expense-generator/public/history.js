/* หน้าต่าง "ประวัติ": บันทึกชุดปัจจุบันลงฐานข้อมูลบนเซิร์ฟเวอร์ · เปิดชุดเก่า · ลบ (เรียก /api/ledgers) */
(function () {
  const $ = (id) => document.getElementById(id);
  const BACKUP = { ok: 'สำรองไป Backblaze แล้ว', failed: 'แต่สำรองไป Backblaze ไม่สำเร็จ (ข้อมูลยังอยู่บนเซิร์ฟเวอร์ จะสำรองอีกครั้งตอนบันทึกครั้งถัดไป)', off: 'ยังไม่ได้ตั้งการสำรองไป Backblaze' };

  /** app: { getState, setState, defaultName, toast, fmtDate } */
  function init(app) {
    const dlg = $('hist');

    async function call(path, opts = {}) {
      const r = await fetch('/api/ledgers' + path, { ...opts, headers: { 'Content-Type': 'application/json' } });
      const body = await r.json().catch(() => ({}));
      if (r.status === 401) { dlg.close(); window.IE.auth.expired(body.error); } // เซสชันหมดอายุ กลับหน้า login
      if (!r.ok) throw Object.assign(new Error(body.error || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'), { status: r.status });
      return body;
    }
    const note = (msg) => { $('hist-note').textContent = msg || ''; };

    async function refresh() {
      try { const { items } = await call(''); render(items); } catch (e) { if (e.status !== 401) note(e.message); }
    }

    function render(items) {
      const ul = $('hist-list'); ul.textContent = '';
      $('hist-empty').hidden = items.length > 0;
      for (const it of items) {
        const li = document.createElement('li');
        const info = document.createElement('div');
        const b = document.createElement('b'); b.textContent = it.name;
        const meta = document.createElement('span'); meta.className = 'lbl sm';
        const saved = new Date(it.savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
        meta.textContent = `${it.start ? app.fmtDate(it.start) + ' – ' + app.fmtDate(it.end) + ' · ' : ''}${it.rowCount} รายการ · บันทึก ${saved}`;
        info.append(b, meta);
        const open = button('เปิด', () => openItem(it.id));
        const del = button('ลบ', () => removeItem(it, del));
        li.append(info, open, del); ul.append(li);
      }
    }
    function button(text, onClick) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = text; b.addEventListener('click', onClick); return b; }

    async function openItem(id) {
      try { const it = await call('/' + id); app.setState(it.data); dlg.close(); app.toast(`เปิด “${it.name}” แล้ว`); } catch (e) { if (e.status !== 401) note(e.message); }
    }

    let armed = null; // กดลบ 2 ครั้งเพื่อยืนยัน เหมือนปุ่ม "ล้างทั้งหมด"
    async function removeItem(it, btn) {
      if (armed !== btn) { armed = btn; btn.textContent = 'กดอีกครั้งเพื่อลบ'; btn.classList.add('danger'); return; }
      armed = null;
      try { const r = await call('/' + it.id, { method: 'DELETE' }); note(`ลบ “${it.name}” แล้ว · ${BACKUP[r.backup]}`); refresh(); } catch (e) { if (e.status !== 401) note(e.message); }
    }

    async function save() {
      const name = $('hist-name').value.trim() || app.defaultName();
      const { settings, rows, plan, nextId } = app.getState();
      if (!rows.length) return note('ยังไม่มีรายการในตาราง สร้างหรือเพิ่มรายการก่อนบันทึก');
      $('hist-save').disabled = true;
      try { const r = await call('', { method: 'POST', body: JSON.stringify({ name, data: { settings, rows, plan, nextId } }) }); $('hist-name').value = ''; note(`บันทึก “${name}” แล้ว · ${BACKUP[r.backup]}`); refresh(); } catch (e) { if (e.status !== 401) note(e.message); } finally { $('hist-save').disabled = false; }
    }

    $('btn-hist').addEventListener('click', () => { note(''); $('hist-name').placeholder = app.defaultName(); dlg.showModal(); refresh(); });
    $('hist-save').addEventListener('click', save);
  }

  window.IE = Object.assign(window.IE || {}, { history: { init } });
})();
