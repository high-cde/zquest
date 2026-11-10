/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";
import { reserveReward } from "../src/budget.js";
import { withTx } from "../src/db.js";
import { humanToAtomic } from "../src/domain/money.js";
import { makeUser, testDb } from "./helpers.js";

test("il cancello 18+ risponde 403 e l'approvazione admin resta in dry-run", async () => {
  const { db, config } = testDb();
  let calls = 0;
  const app = await buildApp({
    config,
    db,
    logger: false,
    sender: async () => {
      calls += 1;
      return "no";
    },
  });
  const entered = await app.inject({ method: "POST", url: "/api/demo/entra", payload: { name: "Prova" } });
  assert.equal(entered.statusCode, 200);
  const token = entered.json().token as string;
  const blocked = await app.inject({
    method: "PUT",
    url: "/api/incontri/profilo",
    headers: { authorization: `Bearer ${token}` },
    payload: { bio: "Una bio abbastanza lunga per il profilo.", interests: ["musica"] },
  });
  assert.equal(blocked.statusCode, 403);

  const minor = await app.inject({
    method: "POST",
    url: "/api/incontri/dichiarazione",
    headers: { authorization: `Bearer ${token}` },
    payload: { years: 17, acceptTerms: true, confirmSelfDeclaration: true },
  });
  assert.equal(minor.statusCode, 403);

  const user = makeUser(db, "Codaweb");
  db.prepare("UPDATE users SET wallet = ? WHERE id = ?").run("So11111111111111111111111111111111111111112", user.id);
  const reserved = withTx(db, () =>
    reserveReward(db, {
      userId: user.id,
      asset: "OV",
      day: "2026-11-07",
      human: 5,
      decimals: 6,
      userCapAtomic: humanToAtomic(500, 6),
      globalCapAtomic: humanToAtomic(10_000, 6),
      reason: "checkin",
      idempotencyKey: "ov:http",
      nowIso: "2026-11-07T12:00:00.000Z",
    }),
  );
  const approved = await app.inject({
    method: "POST",
    url: "/api/admin/coda/approva",
    headers: { "x-admin-token": config.adminToken },
    payload: { ids: [reserved.claimId] },
  });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().results[0].status, "dry_run");
  assert.equal(calls, 0);

  const hype = await app.inject({
    method: "POST",
    url: "/api/admin/bozze",
    headers: { "x-admin-token": config.adminToken },
    payload: { kind: "nota", nota: "to the moon con rendimento" },
  });
  assert.equal(hype.statusCode, 400);
  const sober = await app.inject({
    method: "POST",
    url: "/api/admin/bozze",
    headers: { "x-admin-token": config.adminToken },
    payload: { kind: "nota", nota: "La classifica di questa settimana è sul sito." },
  });
  assert.equal(sober.statusCode, 200);
  assert.equal(String(sober.json().intentUrl).startsWith("https://x.com/intent/post?text="), true);
  await app.close();
});
