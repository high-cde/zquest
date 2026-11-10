/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import Database from "better-sqlite3";

const [dbPath, userId, day] = process.argv.slice(2);
const db = new Database(dbPath);
db.pragma("busy_timeout = 3000");
try {
  db.exec("BEGIN IMMEDIATE");
  const row = db.prepare("SELECT id FROM checkins WHERE user_id = ? AND day = ?").get(userId, day);
  if (row) {
    db.exec("ROLLBACK");
    process.exit(2);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
  db.prepare(
    `INSERT INTO checkins (
      user_id, day, roll_bps, prize_code, paid_code, amount_atomic, streak_bonus_atomic, streak, created_at
    ) VALUES (?, ?, 0, 'secco', 'secco', '0', '0', 1, ?)`,
  ).run(userId, day, new Date().toISOString());
  db.exec("COMMIT");
  process.exit(0);
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {
    /* già chiusa */
  }
  const message = String(error);
  if (message.includes("UNIQUE")) process.exit(3);
  console.error(message);
  process.exit(1);
}
