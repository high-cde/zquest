/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { Config } from "./config.js";
import { releaseClaim } from "./budget.js";
import { audit, getUser, withTx, type Claim, type DB } from "./db.js";

export type Sender = (claim: Claim, config: Config) => Promise<string>;

export type SettleResult = {
  id: number;
  status: string;
  detail: string;
};

const SECRETISH = /secret|private|key|0x[a-f0-9]{20,}/i;

export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "invio non riuscito";
  if (SECRETISH.test(message) && !message.startsWith("chiave")) return "invio non riuscito";
  return message.slice(0, 240);
}

export async function approveBatch(
  db: DB,
  config: Config,
  ids: number[],
  sender: Sender,
  nowMs: number,
): Promise<SettleResult[]> {
  const results: SettleResult[] = [];
  for (const id of ids) {
    results.push(await settleOne(db, config, id, sender, nowMs));
  }
  const nowIso = new Date(nowMs).toISOString();
  audit(db, "approva", JSON.stringify(results.map((item) => ({ id: item.id, status: item.status }))), nowIso);
  return results;
}

export function rejectQueued(db: DB, ids: number[], detail: string, nowMs: number): number {
  const nowIso = new Date(nowMs).toISOString();
  let changed = 0;
  withTx(db, () => {
    for (const id of ids) {
      const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as Claim | undefined;
      if (!claim || claim.status !== "queued") continue;
      db.prepare("UPDATE claims SET status = 'rejected', detail = ?, updated_at = ? WHERE id = ?").run(
        detail,
        nowIso,
        id,
      );
      releaseClaim(db, claim, nowIso, `${claim.idempotency_key}:back`);
      changed += 1;
    }
  });
  return changed;
}

export function unlockSettling(db: DB, ids: number[], nowMs: number): number {
  const nowIso = new Date(nowMs).toISOString();
  let changed = 0;
  for (const id of ids) {
    const result = db
      .prepare(
        `UPDATE claims SET status = 'queued', detail = 'sbloccato', updated_at = ?
         WHERE id = ? AND status = 'settling' AND tx_ref IS NULL`,
      )
      .run(nowIso, id);
    changed += result.changes;
  }
  return changed;
}

async function settleOne(
  db: DB,
  config: Config,
  id: number,
  sender: Sender,
  nowMs: number,
): Promise<SettleResult> {
  const nowIso = new Date(nowMs).toISOString();
  const locked = withTx(db, () => {
    const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as Claim | undefined;
    if (!claim || claim.status !== "queued") {
      return { kind: "skip" as const, status: claim?.status ?? "assente" };
    }
    const user = getUser(db, claim.user_id);
    if (!user || user.banned) {
      db.prepare("UPDATE claims SET status = 'rejected', detail = 'sospeso', updated_at = ? WHERE id = ?").run(
        nowIso,
        id,
      );
      if (claim) releaseClaim(db, claim, nowIso, `${claim.idempotency_key}:back`);
      return { kind: "done" as const, status: "rejected", detail: "Profilo sospeso." };
    }
    const destination = claim.asset === "OV" ? user.wallet : user.polygon_wallet;
    if (!destination) {
      return {
        kind: "done" as const,
        status: "queued",
        detail: "Portafoglio mancante: il premio resta in coda.",
      };
    }
    const updated = db
      .prepare(
        `UPDATE claims SET status = 'settling', destination = ?, updated_at = ?
         WHERE id = ? AND status = 'queued'`,
      )
      .run(destination, nowIso, id);
    if (updated.changes !== 1) return { kind: "skip" as const, status: "queued" };
    return { kind: "send" as const, destination };
  });

  if (locked.kind === "skip") {
    return { id, status: locked.status, detail: "Nessun cambio: non era in coda." };
  }
  if (locked.kind === "done") {
    return { id, status: locked.status, detail: locked.detail };
  }

  const claim = db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as Claim;
  if (!config.rewardsLive) {
    const detail = JSON.stringify({
      live: false,
      asset: claim.asset,
      amountAtomic: claim.amount_atomic,
      destination: locked.destination,
      note: "DRY-RUN: nessuna transazione inviata",
    });
    db.prepare(
      `UPDATE claims SET status = 'dry_run', tx_ref = 'DRY-RUN', detail = ?, updated_at = ? WHERE id = ? AND status = 'settling'`,
    ).run(detail, new Date().toISOString(), id);
    return { id, status: "dry_run", detail: "Contabilizzato in prova. Nessun invio on-chain." };
  }

  try {
    const txRef = await sender(claim, config);
    db.prepare(
      `UPDATE claims SET status = 'sent', tx_ref = ?, detail = NULL, updated_at = ? WHERE id = ? AND status = 'settling'`,
    ).run(txRef, new Date().toISOString(), id);
    return { id, status: "sent", detail: "Inviato." };
  } catch (error) {
    const detail = safeError(error);
    const failed = db.prepare("SELECT * FROM claims WHERE id = ?").get(id) as Claim;
    withTx(db, () => {
      db.prepare(
        `UPDATE claims SET status = 'failed', detail = ?, updated_at = ? WHERE id = ? AND status = 'settling'`,
      ).run(detail, new Date().toISOString(), id);
      releaseClaim(db, failed, new Date().toISOString(), `${failed.idempotency_key}:back`);
    });
    return { id, status: "failed", detail };
  }
}

export async function defaultSender(claim: Claim, config: Config): Promise<string> {
  if (claim.asset === "OV") {
    const module = await import("./payout-solana.js");
    return module.sendOv(claim, config);
  }
  if (claim.asset === "DSN") {
    const module = await import("./payout-polygon.js");
    return module.sendDsn(claim, config);
  }
  throw new Error("asset sconosciuto");
}
