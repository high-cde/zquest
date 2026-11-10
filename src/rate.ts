/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { DB } from "./db.js";

export function rateLimit(db: DB, key: string, limit: number, windowMs: number, nowMs: number): boolean {
  const row = db.prepare("SELECT window_start, count FROM rate_buckets WHERE key = ?").get(key) as
    | { window_start: number; count: number }
    | undefined;
  if (!row || nowMs - row.window_start >= windowMs) {
    db.prepare(
      `INSERT INTO rate_buckets (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
    ).run(key, nowMs);
    return true;
  }
  if (row.count >= limit) return false;
  db.prepare("UPDATE rate_buckets SET count = count + 1 WHERE key = ?").run(key);
  return true;
}
