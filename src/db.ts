/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DB = Database.Database;

export type User = {
  id: number;
  telegram_id: string;
  username: string | null;
  display_name: string | null;
  wallet: string | null;
  polygon_wallet: string | null;
  wallet_linked_at: string | null;
  polygon_linked_at: string | null;
  streak: number;
  last_checkin_day: string | null;
  created_at: string;
  age_gate: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  dating_opt_in: number;
  share_username: number;
  banned: number;
  invite_code: string;
  invited_by: number | null;
  demo: number;
};

export type Claim = {
  id: number;
  user_id: number;
  asset: string;
  day: string;
  amount_atomic: string;
  destination: string | null;
  status: string;
  reason: string;
  idempotency_key: string;
  detail: string | null;
  tx_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type Checkin = {
  id: number;
  user_id: number;
  day: string;
  roll_bps: number;
  prize_code: string;
  paid_code: string;
  amount_atomic: string;
  streak_bonus_atomic: string;
  streak: number;
  limit_reason: string | null;
  created_at: string;
};

export function openDatabase(file: string): DB {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function withTx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* già chiusa */
    }
    throw error;
  }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      telegram_id TEXT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      wallet TEXT UNIQUE,
      polygon_wallet TEXT UNIQUE,
      wallet_linked_at TEXT,
      polygon_linked_at TEXT,
      streak INTEGER NOT NULL DEFAULT 0,
      last_checkin_day TEXT,
      created_at TEXT NOT NULL,
      age_gate TEXT,
      terms_version TEXT,
      terms_accepted_at TEXT,
      dating_opt_in INTEGER NOT NULL DEFAULT 0,
      share_username INTEGER NOT NULL DEFAULT 0,
      banned INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT NOT NULL UNIQUE,
      invited_by INTEGER,
      demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      message TEXT NOT NULL,
      address TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      roll_bps INTEGER NOT NULL,
      prize_code TEXT NOT NULL,
      paid_code TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      streak_bonus_atomic TEXT NOT NULL DEFAULT '0',
      streak INTEGER NOT NULL,
      limit_reason TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, day)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      asset TEXT NOT NULL,
      day TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      destination TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued','settling','dry_run','sent','failed','rejected')),
      reason TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      detail TEXT,
      tx_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY,
      asset TEXT NOT NULL,
      user_id INTEGER,
      day TEXT NOT NULL,
      amount_atomic TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('out','back')),
      reason TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      claim_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget (
      asset TEXT PRIMARY KEY,
      funded_atomic TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_runs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      game TEXT NOT NULL,
      mode TEXT NOT NULL,
      seed TEXT,
      target_at INTEGER,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      score INTEGER,
      day TEXT NOT NULL,
      state TEXT NOT NULL,
      payload TEXT
    );

    CREATE TABLE IF NOT EXISTS game_locks (
      user_id INTEGER NOT NULL,
      game TEXT NOT NULL,
      day TEXT NOT NULL,
      run_id INTEGER NOT NULL,
      amount_atomic TEXT NOT NULL,
      PRIMARY KEY (user_id, game, day)
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      game TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quest_progress (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, code)
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY,
      inviter_id INTEGER NOT NULL,
      invitee_id INTEGER NOT NULL UNIQUE,
      rewarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guide_seen (
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      seen_at TEXT NOT NULL,
      PRIMARY KEY (user_id, section)
    );

    CREATE TABLE IF NOT EXISTS dating_profiles (
      user_id INTEGER PRIMARY KEY,
      bio TEXT NOT NULL,
      interests TEXT NOT NULL,
      city TEXT,
      visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dating_actions (
      id INTEGER PRIMARY KEY,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('like','pass')),
      created_at TEXT NOT NULL,
      UNIQUE(from_id, to_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      user_a INTEGER NOT NULL,
      user_b INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_a, user_b)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      reporter_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      body TEXT NOT NULL,
      intent_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_buckets (
      key TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_asset_day ON ledger(asset, day);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_scores_game ON scores(game, created_at);
    CREATE INDEX IF NOT EXISTS idx_runs_user ON game_runs(user_id, game, state);
  `);
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('schema', '1') ON CONFLICT(key) DO NOTHING",
  ).run();
}

export function getUser(db: DB, id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function audit(db: DB, action: string, detail: string, nowIso: string): void {
  db.prepare("INSERT INTO audit (action, detail, created_at) VALUES (?, ?, ?)").run(
    action,
    detail,
    nowIso,
  );
}
