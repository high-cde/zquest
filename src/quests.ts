/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { capAtomic, tokenOf, type Config } from "./config.js";
import { DSN_QUEST_HUMAN, MAX_INVITE_REWARDS } from "./domain/prizes.js";
import { utcDay } from "./domain/time.js";
import { HttpError, isUniqueError } from "./errors.js";
import { reserveReward } from "./budget.js";
import { getUser, withTx, type DB, type User } from "./db.js";
import { gamesCompleted } from "./games.js";
import { GUIDE, GUIDE_IDS } from "./guide.js";

const GITHUB = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues)\/\d+\/?$/;

export function listQuests(db: DB, user: User) {
  const seen = new Set(
    (db.prepare("SELECT section FROM guide_seen WHERE user_id = ?").all(user.id) as Array<{ section: string }>).map(
      (row) => row.section,
    ),
  );
  const progress = db.prepare("SELECT code, status, evidence FROM quest_progress WHERE user_id = ?").all(user.id) as Array<{
    code: string;
    status: string;
    evidence: string | null;
  }>;
  const byCode = new Map(progress.map((row) => [row.code, row]));
  const inviteCount = (
    db.prepare("SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND rewarded = 1").get(user.id) as { n: number }
  ).n;
  return {
    inviteCode: user.invite_code,
    invitedBy: user.invited_by,
    inviteRewards: inviteCount,
    inviteMax: MAX_INVITE_REWARDS,
    items: [
      {
        code: "guida",
        title: "Leggi la guida",
        human: DSN_QUEST_HUMAN.guida,
        asset: "DSN",
        status: byCode.get("guida")?.status ?? (GUIDE_IDS.every((id) => seen.has(id)) ? "pronta" : "aperta"),
        detail: `${GUIDE_IDS.filter((id) => seen.has(id)).length}/${GUIDE_IDS.length} schede`,
      },
      {
        code: "giochi",
        title: "Chiudi i tre giochi in classifica",
        human: DSN_QUEST_HUMAN.giochi,
        asset: "DSN",
        status: byCode.get("giochi")?.status ?? (gamesCompleted(db, user.id) ? "pronta" : "aperta"),
        detail: "Riflessi, salto e quiz, una manche ciascuno",
      },
      {
        code: "zswap",
        title: "Scheda ZSwap in sola lettura",
        human: DSN_QUEST_HUMAN.zswap,
        asset: "DSN",
        status: byCode.get("zswap")?.status ?? (seen.has("zswap") ? "pronta" : "aperta"),
        detail: "Nessuno scambio viene eseguito da ZQuest",
      },
      {
        code: "github",
        title: "Contributo GitHub accettato",
        human: DSN_QUEST_HUMAN.github,
        asset: "DSN",
        status: byCode.get("github")?.status ?? "aperta",
        detail: byCode.get("github")?.evidence ?? "Un link a pull request o issue, poi revisione umana",
      },
    ],
  };
}

export function markGuide(db: DB, userId: number, section: string, nowIso: string): void {
  if (!GUIDE.some((item) => item.id === section)) {
    throw new HttpError(404, "guida", "Scheda sconosciuta.");
  }
  db.prepare(
    `INSERT INTO guide_seen (user_id, section, seen_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, section) DO NOTHING`,
  ).run(userId, section, nowIso);
}

export function claimReadyQuest(db: DB, config: Config, user: User, code: "guida" | "giochi" | "zswap", nowMs: number) {
  const ready =
    code === "guida"
      ? guideComplete(db, user.id)
      : code === "giochi"
        ? gamesCompleted(db, user.id)
        : sectionSeen(db, user.id, "zswap");
  if (!ready) throw new HttpError(409, "quest", "Questa quest non è ancora completa.");
  return payQuest(db, config, user.id, code, DSN_QUEST_HUMAN[code], null, nowMs);
}

export function submitGithub(db: DB, userId: number, url: string, nowIso: string): void {
  const clean = url.trim();
  if (!GITHUB.test(clean)) {
    throw new HttpError(400, "github", "Serve un link https://github.com/.../pull/n oppure .../issues/n.");
  }
  try {
    db.prepare(
      `INSERT INTO quest_progress (user_id, code, status, evidence, created_at, updated_at)
       VALUES (?, 'github', 'in_revisione', ?, ?, ?)`,
    ).run(userId, clean, nowIso, nowIso);
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "github", "Hai già inviato un contributo.");
    throw error;
  }
}

export function decideGithub(db: DB, config: Config, progressId: number, accept: boolean, nowMs: number) {
  const row = db.prepare("SELECT * FROM quest_progress WHERE id = ? AND code = 'github'").get(progressId) as
    | { id: number; user_id: number; status: string }
    | undefined;
  if (!row || row.status !== "in_revisione") {
    throw new HttpError(409, "github", "Nessuna revisione aperta.");
  }
  const nowIso = new Date(nowMs).toISOString();
  if (!accept) {
    db.prepare("UPDATE quest_progress SET status = 'rifiutata', updated_at = ? WHERE id = ?").run(nowIso, row.id);
    return { status: "rifiutata" };
  }
  const paid = payQuest(db, config, row.user_id, "github", DSN_QUEST_HUMAN.github, null, nowMs);
  db.prepare("UPDATE quest_progress SET status = 'fatta', updated_at = ? WHERE id = ?").run(nowIso, row.id);
  return paid;
}

export function redeemInvite(db: DB, user: User, code: string, config: Config, nowMs: number) {
  const normalized = code.trim().toUpperCase();
  if (user.invited_by) throw new HttpError(409, "invito", "Hai già usato un invito.");
  const inviter = db.prepare("SELECT * FROM users WHERE invite_code = ?").get(normalized) as User | undefined;
  if (!inviter || inviter.id === user.id) throw new HttpError(404, "invito", "Codice non valido.");
  const nowIso = new Date(nowMs).toISOString();
  try {
    withTx(db, () => {
      db.prepare("UPDATE users SET invited_by = ? WHERE id = ? AND invited_by IS NULL").run(inviter.id, user.id);
      db.prepare("INSERT INTO invites (inviter_id, invitee_id, rewarded, created_at) VALUES (?, ?, 0, ?)").run(
        inviter.id,
        user.id,
        nowIso,
      );
    });
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "invito", "Invito già registrato.");
    throw error;
  }
  const fresh = getUser(db, user.id)!;
  if (fresh.last_checkin_day) payInviteIfPending(db, config, fresh.id, utcDay(nowMs), nowIso);
  return { inviter: inviter.display_name || inviter.invite_code };
}

export function payInviteIfPending(db: DB, config: Config, inviteeId: number, day: string, nowIso: string): void {
  const invite = db.prepare("SELECT * FROM invites WHERE invitee_id = ? AND rewarded = 0").get(inviteeId) as
    | { id: number; inviter_id: number }
    | undefined;
  if (!invite) return;
  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND rewarded = 1").get(invite.inviter_id) as {
      n: number;
    }
  ).n;
  if (count >= MAX_INVITE_REWARDS) return;
  withTx(db, () => {
    const still = db.prepare("SELECT rewarded FROM invites WHERE id = ?").get(invite.id) as { rewarded: number };
    if (still.rewarded) return;
    const dsn = tokenOf(config, "DSN");
    const reserved = reserveReward(db, {
      userId: invite.inviter_id,
      asset: "DSN",
      day,
      human: DSN_QUEST_HUMAN.invito,
      decimals: dsn.decimals,
      userCapAtomic: capAtomic(dsn, "user"),
      globalCapAtomic: capAtomic(dsn, "global"),
      reason: "quest:invito",
      idempotencyKey: `dsn:invito:${inviteeId}`,
      nowIso,
    });
    if (reserved.claimId && !reserved.limit) {
      db.prepare("UPDATE invites SET rewarded = 1 WHERE id = ?").run(invite.id);
    }
  });
}

function guideComplete(db: DB, userId: number): boolean {
  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM guide_seen WHERE user_id = ?").get(userId) as { n: number }
  ).n;
  return count >= GUIDE_IDS.length;
}

function sectionSeen(db: DB, userId: number, section: string): boolean {
  return Boolean(db.prepare("SELECT 1 AS ok FROM guide_seen WHERE user_id = ? AND section = ?").get(userId, section));
}

function payQuest(
  db: DB,
  config: Config,
  userId: number,
  code: string,
  human: number,
  evidence: string | null,
  nowMs: number,
) {
  const nowIso = new Date(nowMs).toISOString();
  const day = nowIso.slice(0, 10);
  return withTx(db, () => {
    const existing = db.prepare("SELECT status FROM quest_progress WHERE user_id = ? AND code = ?").get(userId, code) as
      | { status: string }
      | undefined;
    if (existing?.status === "fatta") throw new HttpError(409, "quest", "Quest già chiusa.");
    const dsn = tokenOf(config, "DSN");
    const reserved = reserveReward(db, {
      userId,
      asset: "DSN",
      day,
      human,
      decimals: dsn.decimals,
      userCapAtomic: capAtomic(dsn, "user"),
      globalCapAtomic: capAtomic(dsn, "global"),
      reason: `quest:${code}`,
      idempotencyKey: `dsn:quest:${code}:${userId}`,
      nowIso,
    });
    if (reserved.limit) {
      throw new HttpError(409, reserved.limit, "Tetto o budget: la quest resta aperta, riprova un altro giorno.");
    }
    if (code !== "github") {
      db.prepare(
        `INSERT INTO quest_progress (user_id, code, status, evidence, created_at, updated_at)
         VALUES (?, ?, 'fatta', ?, ?, ?)
         ON CONFLICT(user_id, code) DO UPDATE SET status = 'fatta', updated_at = excluded.updated_at`,
      ).run(userId, code, evidence, nowIso, nowIso);
    }
    return { status: "fatta" as const, amountAtomic: reserved.amountAtomic, claimId: reserved.claimId };
  });
}
