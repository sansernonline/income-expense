/* ฐานข้อมูล SQLite ของชุดรายรับรายจ่ายที่บันทึกไว้ (node:sqlite มากับ Node 22 ไม่ต้องลงแพ็กเกจ) */
const fs = require('node:fs');

const SCHEMA = `CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  row_count INTEGER NOT NULL,
  data TEXT NOT NULL
)`;

function openStore(file) {
  const { DatabaseSync } = require('node:sqlite'); // โหลดเมื่อใช้จริง (โมดูลนี้ยังเตือน experimental)
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const q = {
    list: db.prepare('SELECT id, name, saved_at AS savedAt, start_date AS start, end_date AS end, row_count AS rowCount FROM ledgers ORDER BY id DESC LIMIT 500'),
    get: db.prepare('SELECT id, name, saved_at AS savedAt, data FROM ledgers WHERE id = ?'),
    add: db.prepare('INSERT INTO ledgers (name, saved_at, start_date, end_date, row_count, data) VALUES (?, ?, ?, ?, ?, ?)'),
    remove: db.prepare('DELETE FROM ledgers WHERE id = ?'),
  };
  return {
    list: () => q.list.all(),
    get: (id) => { const r = q.get.get(id); return r ? { ...r, data: JSON.parse(r.data) } : null; },
    add: (name, data) => Number(q.add.run(name, new Date().toISOString(), data.settings.start || null, data.settings.end || null, data.rows.length, JSON.stringify(data)).lastInsertRowid),
    remove: (id) => q.remove.run(id).changes > 0,
    /** สำเนาที่สมบูรณ์ของฐานข้อมูล ณ ตอนนี้ (VACUUM INTO) สำหรับส่งไปสำรอง */
    snapshot(tmp) {
      fs.rmSync(tmp, { force: true });
      db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      try { return fs.readFileSync(tmp); } finally { fs.rmSync(tmp, { force: true }); }
    },
    close: () => db.close(),
  };
}

module.exports = { openStore };
