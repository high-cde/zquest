/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { DB } from "./db.js";
import { inviteCode } from "./users.js";

const PEOPLE = [
  { name: "mattonella", salto: 28, quiz: 5, riflessi: 210 },
  { name: "stellina", salto: 18, quiz: 4, riflessi: 260 },
  { name: "briciola", salto: 12, quiz: 5, riflessi: 190 },
  { name: "violaquieta", salto: 36, quiz: 3, riflessi: 305 },
];

/** Punteggi fittizi, segnati come demo, solo se il database è vuoto. Nessun profilo incontri. */
export function seedDemo(db: DB, nowMs: number): void {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (count.n > 0) return;
  const nowIso = new Date(nowMs).toISOString();
  const insertUser = db.prepare(
    `INSERT INTO users (telegram_id, display_name, created_at, invite_code, demo)
     VALUES (?, ?, ?, ?, 1)`,
  );
  const insertScore = db.prepare(
    "INSERT INTO scores (user_id, game, score, created_at) VALUES (?, ?, ?, ?)",
  );
  for (const person of PEOPLE) {
    const result = insertUser.run(`demo:seed:${person.name}`, person.name, nowIso, inviteCode());
    const userId = Number(result.lastInsertRowid);
    insertScore.run(userId, "salto", person.salto, nowIso);
    insertScore.run(userId, "quiz", person.quiz, nowIso);
    insertScore.run(userId, "riflessi", person.riflessi, nowIso);
  }
}
