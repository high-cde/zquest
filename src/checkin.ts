/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { capAtomic, tokenOf, type Config } from "./config.js";
import {
  DSN_QUEST_HUMAN,
  MAX_INVITE_REWARDS,
  STREAK_BONUS_HUMAN,
  STREAK_EVERY_DAYS,
  prizeForRoll,
  type LimitReason,
} from "./domain/prizes.js";
import { addUtcDays, utcDay } from "./domain/time.js";
import { HttpError, isUniqueError } from "./errors.js";
import { reserveReward } from "./budget.js";
import { getUser, withTx, type Checkin, type DB } from "./db.js";

export type CheckinOutcome = {
  already: boolean;
  day: string;
  streak: number;
  roll: number | null;
  prizeCode: string;
  paidCode: string;
  amountAtomic: string;
  limit: LimitReason | null;
  streakBonusAtomic: string;
  streakLimit: LimitReason | null;
  claimIds: number[];
};

export function performCheckin(
  db: DB,
  config: Config,
  userId: number,
  nowMs: number,
  roll: () => number = () => {
    throw new Error("estrazione mancante");
  },
): CheckinOutcome {
  try {
    return withTx(db, () => checkinTx(db, config, userId, nowMs, roll));
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const day = utcDay(nowMs);
    const existing = db
      .prepare("SELECT * FROM checkins WHERE user_id = ? AND day = ?")
      .get(userId, day) as Checkin | undefined;
    if (!existing) throw error;
    return outcomeFromRow(existing, true);
  }
}

function checkinTx(
  db: DB,
  config: Config,
  userId: number,
  nowMs: number,
  roll: () => number,
): CheckinOutcome {
  const user = getUser(db, userId);
  if (!user) throw new Error("utente assente");
  if (user.banned) throw new HttpError(403, "sospeso", "Profilo sospeso dalla moderazione.");
  const day = utcDay(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const existing = db
    .prepare("SELECT * FROM checkins WHERE user_id = ? AND day = ?")
    .get(userId, day) as Checkin | undefined;
  if (existing) return outcomeFromRow(existing, true);

  const drawn = roll();
  const prize = prizeForRoll(drawn);
  let streak = 1;
  if (user.last_checkin_day === addUtcDays(day, -1)) streak = user.streak + 1;

  const ov = tokenOf(config, "OV");
  const claimIds: number[] = [];
  const reserved = reserveReward(db, {
    userId,
    asset: "OV",
    day,
    human: prize.human,
    decimals: ov.decimals,
    userCapAtomic: capAtomic(ov, "user"),
    globalCapAtomic: capAtomic(ov, "global"),
    reason: "checkin",
    idempotencyKey: `ov:checkin:${userId}:${day}`,
    nowIso,
  });
  if (reserved.claimId && !reserved.duplicate) claimIds.push(reserved.claimId);

  let streakBonusAtomic = "0";
  let streakLimit: LimitReason | null = null;
  if (streak > 0 && streak % STREAK_EVERY_DAYS === 0) {
    const bonus = reserveReward(db, {
      userId,
      asset: "OV",
      day,
      human: STREAK_BONUS_HUMAN,
      decimals: ov.decimals,
      userCapAtomic: capAtomic(ov, "user"),
      globalCapAtomic: capAtomic(ov, "global"),
      reason: "streak",
      idempotencyKey: `ov:streak:${userId}:${day}`,
      nowIso,
    });
    streakBonusAtomic = bonus.amountAtomic;
    streakLimit = bonus.limit;
    if (bonus.claimId && !bonus.duplicate) claimIds.push(bonus.claimId);
  }

  const paidCode = reserved.limit ?? prize.code;
  db.prepare(
    `INSERT INTO checkins (
      user_id, day, roll_bps, prize_code, paid_code, amount_atomic, streak_bonus_atomic,
      streak, limit_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId,
    day,
    drawn,
    prize.code,
    paidCode,
    reserved.amountAtomic,
    streakBonusAtomic,
    streak,
    reserved.limit,
    nowIso,
  );
  db.prepare("UPDATE users SET streak = ?, last_checkin_day = ? WHERE id = ?").run(streak, day, userId);
  rewardInvite(db, config, userId, day, nowIso);
  return {
    already: false,
    day,
    streak,
    roll: drawn,
    prizeCode: prize.code,
    paidCode,
    amountAtomic: reserved.amountAtomic,
    limit: reserved.limit,
    streakBonusAtomic,
    streakLimit,
    claimIds,
  };
}

function rewardInvite(db: DB, config: Config, inviteeId: number, day: string, nowIso: string): void {
  const invite = db
    .prepare("SELECT * FROM invites WHERE invitee_id = ? AND rewarded = 0")
    .get(inviteeId) as { id: number; inviter_id: number } | undefined;
  if (!invite) return;
  const countRow = db
    .prepare("SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND rewarded = 1")
    .get(invite.inviter_id) as { n: number };
  if (countRow.n >= MAX_INVITE_REWARDS) return;
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
}

function outcomeFromRow(row: Checkin, already: boolean): CheckinOutcome {
  return {
    already,
    day: row.day,
    streak: row.streak,
    roll: row.roll_bps,
    prizeCode: row.prize_code,
    paidCode: row.paid_code,
    amountAtomic: row.amount_atomic,
    limit: (row.limit_reason as LimitReason | null) ?? null,
    streakBonusAtomic: row.streak_bonus_atomic,
    streakLimit: null,
    claimIds: [],
  };
}
