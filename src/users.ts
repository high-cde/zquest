/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { randomBytes } from "node:crypto";
import { HttpError } from "./errors.js";
import { getUser, withTx, type DB, type User } from "./db.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function inviteCode(): string {
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function cleanName(raw: string): string {
  const name = raw.trim();
  if (!/^[\p{L}\p{N}_]{3,16}$/u.test(name)) {
    throw new HttpError(400, "nome", "Il nome usa 3-16 lettere, numeri o underscore.");
  }
  return name;
}

export function displayOf(user: User): string {
  return user.display_name || user.username || `socio-${user.id}`;
}

function insertUser(
  db: DB,
  input: {
    telegramId: string;
    username: string | null;
    displayName: string | null;
    demo: number;
    nowIso: string;
  },
): User {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = db
        .prepare(
          `INSERT INTO users (telegram_id, username, display_name, created_at, invite_code, demo)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.telegramId,
          input.username,
          input.displayName,
          input.nowIso,
          inviteCode(),
          input.demo,
        );
      const user = getUser(db, Number(result.lastInsertRowid));
      if (!user) throw new Error("utente non creato");
      return user;
    } catch (error) {
      if (error instanceof Error && error.message.includes("invite_code")) continue;
      throw error;
    }
  }
  throw new Error("codice invito non generato");
}

export function createDemoUser(db: DB, name: string, nowIso: string): User {
  const displayName = cleanName(name);
  const telegramId = `demo:${randomBytes(9).toString("hex")}`;
  return insertUser(db, { telegramId, username: null, displayName, demo: 1, nowIso });
}

export function upsertTelegramUser(
  db: DB,
  telegram: { id: number; username?: string },
  nowIso: string,
): User {
  const telegramId = String(telegram.id);
  const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as
    | User
    | undefined;
  if (existing) {
    if (telegram.username && telegram.username !== existing.username) {
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(telegram.username, existing.id);
      return getUser(db, existing.id)!;
    }
    return existing;
  }
  return insertUser(db, {
    telegramId,
    username: telegram.username ?? null,
    displayName: telegram.username ?? null,
    demo: 0,
    nowIso,
  });
}

export function requireUser(db: DB, id: number): User {
  const user = getUser(db, id);
  if (!user) throw new HttpError(401, "sessione", "Sessione non valida.");
  if (user.banned) throw new HttpError(403, "sospeso", "Profilo sospeso dalla moderazione.");
  return user;
}

export function anonymizeAccount(db: DB, userId: number, nowIso: string): void {
  withTx(db, () => {
    eraseDatingRows(db, userId);
    db.prepare(
      `UPDATE claims SET status = 'rejected', detail = 'account_cancellato', updated_at = ?
       WHERE user_id = ? AND status = 'queued'`,
    ).run(nowIso, userId);
    const queued = db
      .prepare("SELECT * FROM claims WHERE user_id = ? AND detail = 'account_cancellato' AND status = 'rejected'")
      .all(userId) as import("./db.js").Claim[];
    for (const claim of queued) {
      const key = `${claim.idempotency_key}:back`;
      const exists = db.prepare("SELECT id FROM ledger WHERE idempotency_key = ?").get(key);
      if (exists) continue;
      db.prepare(
        `INSERT INTO ledger (
          asset, user_id, day, amount_atomic, direction, reason, idempotency_key, claim_id, created_at
        ) VALUES (?, ?, ?, ?, 'back', ?, ?, ?, ?)`,
      ).run(
        claim.asset,
        claim.user_id,
        claim.day,
        claim.amount_atomic,
        claim.reason,
        key,
        claim.id,
        nowIso,
      );
    }
    db.prepare(
      `UPDATE users SET
        telegram_id = ?, username = NULL, display_name = 'rimosso',
        wallet = NULL, polygon_wallet = NULL, dating_opt_in = 0, demo = 0
       WHERE id = ?`,
    ).run(`deleted:${userId}`, userId);
  });
}

export function eraseDating(db: DB, userId: number): void {
  withTx(db, () => {
    eraseDatingRows(db, userId);
    const user = getUser(db, userId);
    if (user && user.age_gate !== "under") {
      db.prepare(
        `UPDATE users SET dating_opt_in = 0, age_gate = NULL, terms_version = NULL, terms_accepted_at = NULL
         WHERE id = ?`,
      ).run(userId);
    } else {
      db.prepare("UPDATE users SET dating_opt_in = 0 WHERE id = ?").run(userId);
    }
  });
}

function eraseDatingRows(db: DB, userId: number): void {
  db.prepare("DELETE FROM dating_profiles WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM dating_actions WHERE from_id = ? OR to_id = ?").run(userId, userId);
  db.prepare("DELETE FROM matches WHERE user_a = ? OR user_b = ?").run(userId, userId);
  db.prepare("DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?").run(userId, userId);
  db.prepare("DELETE FROM reports WHERE reporter_id = ?").run(userId);
}
