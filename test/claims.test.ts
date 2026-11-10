/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { reserveReward } from "../src/budget.js";
import { approveBatch, rejectQueued } from "../src/claims.js";
import { withTx } from "../src/db.js";
import { humanToAtomic } from "../src/domain/money.js";
import { makeUser, testConfig, testDb } from "./helpers.js";

function queue(db: ReturnType<typeof testDb>["db"], config: ReturnType<typeof testConfig>, userId: number) {
  return withTx(db, () =>
    reserveReward(db, {
      userId,
      asset: "OV",
      day: "2026-11-07",
      human: 5,
      decimals: 6,
      userCapAtomic: humanToAtomic(500, 6),
      globalCapAtomic: humanToAtomic(10_000, 6),
      reason: "checkin",
      idempotencyKey: `ov:test:${userId}`,
      nowIso: "2026-11-07T12:00:00.000Z",
    }),
  );
}

test("l'approvazione in dry-run non chiama il mittente e non si ripete", async () => {
  const { db, config } = testDb();
  const user = makeUser(db);
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run("So11111111111111111111111111111111111111112", user.id);
  const reserved = queue(db, config, user.id);
  assert.ok(reserved.claimId);
  let calls = 0;
  const sender = async () => {
    calls += 1;
    return "non-deve-partire";
  };
  const first = await approveBatch(db, config, [reserved.claimId!], sender, Date.UTC(2026, 10, 7, 13));
  const second = await approveBatch(db, config, [reserved.claimId!], sender, Date.UTC(2026, 10, 7, 14));
  assert.equal(calls, 0);
  assert.equal(first[0]?.status, "dry_run");
  assert.equal(second[0]?.status, "dry_run");
  const row = db.prepare("SELECT status, tx_ref FROM claims WHERE id = ?").get(reserved.claimId) as {
    status: string;
    tx_ref: string;
  };
  assert.equal(row.status, "dry_run");
  assert.equal(row.tx_ref, "DRY-RUN");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n, 1);
});

test("con REWARDS_LIVE il mittente parte una sola volta", async () => {
  const config = testConfig({ rewardsLive: true });
  const { db } = testDb(config);
  const user = makeUser(db, "Vivo");
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run("So11111111111111111111111111111111111111112", user.id);
  const reserved = queue(db, config, user.id);
  let calls = 0;
  const sender = async () => {
    calls += 1;
    return "firma-di-prova";
  };
  const first = await approveBatch(db, config, [reserved.claimId!], sender, Date.now());
  await approveBatch(db, config, [reserved.claimId!], sender, Date.now());
  assert.equal(calls, 1);
  assert.equal(first[0]?.status, "sent");
  const row = db.prepare("SELECT tx_ref FROM claims WHERE id = ?").get(reserved.claimId) as { tx_ref: string };
  assert.equal(row.tx_ref, "firma-di-prova");
});

test("senza portafoglio la coda non si chiude e il mittente resta fermo", async () => {
  const { db, config } = testDb();
  const user = makeUser(db, "Nudo");
  const reserved = queue(db, config, user.id);
  let calls = 0;
  const result = await approveBatch(db, config, [reserved.claimId!], async () => {
    calls += 1;
    return "x";
  }, Date.now());
  assert.equal(calls, 0);
  assert.equal(result[0]?.status, "queued");
  const row = db.prepare("SELECT status FROM claims WHERE id = ?").get(reserved.claimId) as { status: string };
  assert.equal(row.status, "queued");
});

test("un invio fallito restituisce il budget e il rifiuto pure", async () => {
  const config = testConfig({ rewardsLive: true, ov: { budgetHuman: 5 } });
  const { db } = testDb(config);
  const user = makeUser(db, "Errore");
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run("So11111111111111111111111111111111111111112", user.id);
  const reserved = queue(db, config, user.id);
  const failed = await approveBatch(db, config, [reserved.claimId!], async () => {
    throw new Error("rpc giù");
  }, Date.now());
  assert.equal(failed[0]?.status, "failed");
  const other = makeUser(db, "Altro");
  const second = withTx(db, () =>
    reserveReward(db, {
      userId: other.id,
      asset: "OV",
      day: "2026-11-08",
      human: 5,
      decimals: 6,
      userCapAtomic: humanToAtomic(500, 6),
      globalCapAtomic: humanToAtomic(10_000, 6),
      reason: "checkin",
      idempotencyKey: "ov:test:altro",
      nowIso: "2026-11-08T12:00:00.000Z",
    }),
  );
  assert.equal(second.limit, null);
  assert.equal(rejectQueued(db, [second.claimId!], "prova", Date.now()), 1);
  const third = withTx(db, () =>
    reserveReward(db, {
      userId: other.id,
      asset: "OV",
      day: "2026-11-09",
      human: 5,
      decimals: 6,
      userCapAtomic: humanToAtomic(500, 6),
      globalCapAtomic: humanToAtomic(10_000, 6),
      reason: "checkin",
      idempotencyKey: "ov:test:altro-2",
      nowIso: "2026-11-09T12:00:00.000Z",
    }),
  );
  assert.equal(third.limit, null);
});
