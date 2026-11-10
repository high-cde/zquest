/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import {
  acknowledgeRules,
  claimMission,
  seedAirdrop,
  setGlobalPause,
  syncRewardsLiveFlag,
  updateAirdropToken,
  updateMission,
  XZDOS_MINT,
} from "../src/airdrop.js";
import { makeUser, testConfig, testDb } from "./helpers.js";

const wallet = "So11111111111111111111111111111111111111112";
const now = Date.UTC(2026, 10, 10, 12, 0, 0);

function open() {
  const ctx = testDb();
  seedAirdrop(ctx.db, ctx.config);
  syncRewardsLiveFlag(ctx.db, ctx.config.rewardsLive);
  return ctx;
}

function ready(db: ReturnType<typeof testDb>["db"]) {
  const user = makeUser(db, "Airdrop");
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run(wallet, user.id);
  acknowledgeRules(db, user.id, new Date(now).toISOString());
  updateAirdropToken(db, { mint: XZDOS_MINT, cooldownSec: 0 });
  return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as ReturnType<typeof makeUser>;
}

test("il riscatto in dry-run non chiama il mittente e non si ripete", async () => {
  const { db, config } = open();
  const user = ready(db);
  let calls = 0;
  const sender = async () => {
    calls += 1;
    return "no";
  };
  const first = await claimMission(db, config, user, "regole", now, "127.0.0.1", sender);
  assert.equal(first.status, "dry_run");
  assert.equal(calls, 0);
  await assert.rejects(() => claimMission(db, config, user, "regole", now + 1000, "127.0.0.1", sender), /già stata riscattata/);
  assert.equal(calls, 0);
  const rows = db.prepare("SELECT status, tx_ref FROM airdrop_claims").all() as Array<{ status: string; tx_ref: string | null }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "dry_run");
  assert.equal(rows[0]?.tx_ref, null);
});

test("senza missione verificata, senza portafoglio o in pausa non si riscatta", async () => {
  const { db, config } = open();
  const user = makeUser(db, "Vuoto");
  await assert.rejects(() => claimMission(db, config, user, "checkin", now, "10.0.0.1", async () => "x"), /Collega Phantom/);
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run(wallet, user.id);
  const linked = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
  await assert.rejects(() => claimMission(db, config, linked, "checkin", now, "10.0.0.1", async () => "x"), /non ancora completata/);
  acknowledgeRules(db, linked.id, new Date(now).toISOString());
  setGlobalPause(db, true);
  await assert.rejects(() => claimMission(db, config, linked, "regole", now, "10.0.0.1", async () => "x"), /in pausa/);
});

test("tetto del portafoglio, tetto del giorno e cooldown", async () => {
  const { db, config } = open();
  const user = ready(db);
  updateAirdropToken(db, { mint: XZDOS_MINT, walletCapHuman: 5, dailyCapHuman: 100, cooldownSec: 0 });
  updateMission(db, { code: "regole", amountHuman: 5 });
  updateMission(db, { code: "gioco", amountHuman: 5 });
  db.prepare(
    "INSERT INTO game_runs (user_id, game, mode, started_at, day, state) VALUES (?, 'salto', 'classifica', ?, '2026-11-10', 'done')",
  ).run(user.id, now);
  await claimMission(db, config, user, "regole", now, "10.0.0.2", async () => "x");
  await assert.rejects(() => claimMission(db, config, user, "gioco", now + 1000, "10.0.0.2", async () => "x"), /Tetto del portafoglio/);

  const other = makeUser(db, "Altro");
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run("So11111111111111111111111111111111111111113", other.id);
  const second = db.prepare("SELECT * FROM users WHERE id = ?").get(other.id) as typeof other;
  acknowledgeRules(db, second.id, new Date(now).toISOString());
  updateAirdropToken(db, { mint: XZDOS_MINT, walletCapHuman: 20, dailyCapHuman: 5, cooldownSec: 3600 });
  await assert.rejects(() => claimMission(db, config, second, "regole", now + 2000, "10.0.0.3", async () => "x"), /Tetto di comunità/);

  updateAirdropToken(db, { mint: XZDOS_MINT, dailyCapHuman: 200, cooldownSec: 3600 });
  db.prepare(
    "INSERT INTO game_runs (user_id, game, mode, started_at, day, state) VALUES (?, 'quiz', 'classifica', ?, '2026-11-10', 'done')",
  ).run(second.id, now);
  await claimMission(db, config, second, "regole", now + 3000, "10.0.0.3", async () => "x");
  await assert.rejects(() => claimMission(db, config, second, "gioco", now + 4000, "10.0.0.3", async () => "x"), /Aspetta/);
});

test("l'endpoint registra il dry-run e l'admin cambia l'importo", async () => {
  const { db, config } = testDb();
  let calls = 0;
  const app = await buildApp({
    config,
    db,
    logger: false,
    airdropSender: async () => {
      calls += 1;
      return "no";
    },
  });
  const entered = await app.inject({ method: "POST", url: "/api/demo/entra", payload: { name: "Drop" } });
  const token = entered.json().token as string;
  const userId = entered.json().user.id as number;
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run(wallet, userId);
  await app.inject({ method: "POST", url: "/api/airdrop/regole", headers: { authorization: `Bearer ${token}` } });
  const changed = await app.inject({
    method: "POST",
    url: "/api/admin/airdrop/missione",
    headers: { "x-admin-token": config.adminToken },
    payload: { code: "regole", amountHuman: 2 },
  });
  assert.equal(changed.statusCode, 200);
  const claimed = await app.inject({
    method: "POST",
    url: "/api/airdrop/riscuoti",
    headers: { authorization: `Bearer ${token}` },
    payload: { code: "regole" },
  });
  assert.equal(claimed.statusCode, 200);
  assert.equal(claimed.json().status, "dry_run");
  assert.equal(claimed.json().amount, "2");
  assert.equal(calls, 0);
  const view = await app.inject({ method: "GET", url: "/api/airdrop", headers: { authorization: `Bearer ${token}` } });
  assert.equal(view.json().history.length, 1);
  assert.equal(view.json().rewardsLive, false);
  await app.close();
});
