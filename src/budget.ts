/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { Asset } from "./config.js";
import type { LimitReason } from "./domain/prizes.js";
import { humanToAtomic } from "./domain/money.js";
import type { Claim, DB } from "./db.js";

export type ReserveResult = {
  claimId: number | null;
  amountAtomic: string;
  limit: LimitReason | null;
  duplicate: boolean;
};

export function syncFunding(db: DB, asset: Asset, human: number, decimals: number, nowIso: string): void {
  const atomic = humanToAtomic(human, decimals).toString();
  db.prepare(
    `INSERT INTO budget (asset, funded_atomic, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(asset) DO UPDATE SET funded_atomic = excluded.funded_atomic, updated_at = excluded.updated_at`,
  ).run(asset, atomic, nowIso);
}

export function fundedAtomic(db: DB, asset: Asset): bigint {
  const row = db.prepare("SELECT funded_atomic FROM budget WHERE asset = ?").get(asset) as
    | { funded_atomic: string }
    | undefined;
  return row ? BigInt(row.funded_atomic) : 0n;
}

export function netSpent(
  db: DB,
  asset: Asset,
  filter: { day?: string; userId?: number } = {},
): bigint {
  const where = ["asset = ?"];
  const params: Array<string | number> = [asset];
  if (filter.day) {
    where.push("day = ?");
    params.push(filter.day);
  }
  if (filter.userId !== undefined) {
    where.push("user_id = ?");
    params.push(filter.userId);
  }
  const rows = db
    .prepare(`SELECT amount_atomic, direction FROM ledger WHERE ${where.join(" AND ")}`)
    .all(...params) as Array<{ amount_atomic: string; direction: string }>;
  let net = 0n;
  for (const row of rows) {
    const amount = BigInt(row.amount_atomic);
    net += row.direction === "back" ? -amount : amount;
  }
  return net;
}

/**
 * Prenota un omaggio. Va chiamata dentro una transazione del chiamante.
 * Non crea righe se l'importo è zero o se un tetto / il budget non bastano.
 */
export function reserveReward(
  db: DB,
  input: {
    userId: number;
    asset: Asset;
    day: string;
    human: number;
    decimals: number;
    userCapAtomic: bigint;
    globalCapAtomic: bigint;
    reason: string;
    idempotencyKey: string;
    nowIso: string;
  },
): ReserveResult {
  const existing = db
    .prepare("SELECT id, amount_atomic FROM claims WHERE idempotency_key = ?")
    .get(input.idempotencyKey) as { id: number; amount_atomic: string } | undefined;
  if (existing) {
    return {
      claimId: existing.id,
      amountAtomic: existing.amount_atomic,
      limit: null,
      duplicate: true,
    };
  }
  const atomic = humanToAtomic(input.human, input.decimals);
  if (atomic === 0n) {
    return { claimId: null, amountAtomic: "0", limit: null, duplicate: false };
  }
  const userSpent = netSpent(db, input.asset, { day: input.day, userId: input.userId });
  if (userSpent + atomic > input.userCapAtomic) {
    return { claimId: null, amountAtomic: "0", limit: "cap_utente", duplicate: false };
  }
  const globalSpent = netSpent(db, input.asset, { day: input.day });
  if (globalSpent + atomic > input.globalCapAtomic) {
    return { claimId: null, amountAtomic: "0", limit: "cap_globale", duplicate: false };
  }
  const endowed = fundedAtomic(db, input.asset);
  const allSpent = netSpent(db, input.asset);
  if (allSpent + atomic > endowed) {
    return { claimId: null, amountAtomic: "0", limit: "budget", duplicate: false };
  }
  const amount = atomic.toString();
  const claim = db
    .prepare(
      `INSERT INTO claims (
        user_id, asset, day, amount_atomic, status, reason, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.asset,
      input.day,
      amount,
      input.reason,
      input.idempotencyKey,
      input.nowIso,
      input.nowIso,
    );
  const claimId = Number(claim.lastInsertRowid);
  db.prepare(
    `INSERT INTO ledger (
      asset, user_id, day, amount_atomic, direction, reason, idempotency_key, claim_id, created_at
    ) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?)`,
  ).run(
    input.asset,
    input.userId,
    input.day,
    amount,
    input.reason,
    input.idempotencyKey,
    claimId,
    input.nowIso,
  );
  return { claimId, amountAtomic: amount, limit: null, duplicate: false };
}

export function releaseClaim(db: DB, claim: Claim, nowIso: string, directionKey: string): void {
  const already = db
    .prepare("SELECT id FROM ledger WHERE idempotency_key = ?")
    .get(directionKey) as { id: number } | undefined;
  if (already) return;
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
    directionKey,
    claim.id,
    nowIso,
  );
}

export function budgetView(db: DB, asset: Asset, day: string, decimals: number) {
  const funded = fundedAtomic(db, asset);
  const spent = netSpent(db, asset);
  const today = netSpent(db, asset, { day });
  return {
    asset,
    fundedAtomic: funded.toString(),
    spentAtomic: spent.toString(),
    remainingAtomic: (funded - spent).toString(),
    todayAtomic: today.toString(),
    decimals,
  };
}
