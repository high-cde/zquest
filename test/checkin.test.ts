/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { performCheckin } from "../src/checkin.js";
import { makeUser, testConfig, testDb } from "./helpers.js";

const day0 = Date.UTC(2026, 10, 1, 12, 0, 0);

test("il secondo check-in dello stesso giorno non crea un altro premio", () => {
  const { db, config } = testDb();
  const user = makeUser(db);
  const first = performCheckin(db, config, user.id, day0, () => 6000);
  const second = performCheckin(db, config, user.id, day0 + 1000, () => 9900);
  assert.equal(first.already, false);
  assert.equal(first.prizeCode, "scintilla");
  assert.equal(first.amountAtomic, "5000000");
  assert.equal(second.already, true);
  const claims = db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number };
  const checkins = db.prepare("SELECT COUNT(*) AS n FROM checkins").get() as { n: number };
  assert.equal(claims.n, 1);
  assert.equal(checkins.n, 1);
});

test("il tetto personale azzera la zecca e lascia traccia", () => {
  const config = testConfig({ ov: { dailyUserCapHuman: 10 } });
  const { db } = testDb(config);
  const user = makeUser(db);
  const result = performCheckin(db, config, user.id, day0, () => 9900);
  assert.equal(result.prizeCode, "zecca");
  assert.equal(result.limit, "cap_utente");
  assert.equal(result.amountAtomic, "0");
  const claims = db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number };
  assert.equal(claims.n, 0);
});

test("il tetto di comunità blocca il secondo omaggio del giorno", () => {
  const config = testConfig({ ov: { dailyGlobalCapHuman: 5, dailyUserCapHuman: 500 } });
  const { db } = testDb(config);
  const first = makeUser(db, "Prima");
  const second = makeUser(db, "Seconda");
  const a = performCheckin(db, config, first.id, day0, () => 6000);
  const b = performCheckin(db, config, second.id, day0, () => 6000);
  assert.equal(a.limit, null);
  assert.equal(b.limit, "cap_globale");
  assert.equal(b.amountAtomic, "0");
});

test("il budget esaurito non prenota oltre il finanziato", () => {
  const config = testConfig({ ov: { budgetHuman: 5 } });
  const { db } = testDb(config);
  const first = makeUser(db, "Cassa");
  const second = makeUser(db, "Coda");
  performCheckin(db, config, first.id, day0, () => 6000);
  const blocked = performCheckin(db, config, second.id, day0, () => 6000);
  assert.equal(blocked.limit, "budget");
  const spent = db.prepare("SELECT amount_atomic FROM ledger WHERE direction = 'out'").all() as Array<{
    amount_atomic: string;
  }>;
  const total = spent.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n);
  assert.equal(total, 5_000_000n);
});

test("la serie cresce sui giorni contigui e al settimo aggiunge il bonus fisso", () => {
  const { db, config } = testDb();
  const user = makeUser(db, "Serie");
  for (let i = 0; i < 6; i++) {
    const step = performCheckin(db, config, user.id, day0 + i * 86_400_000, () => 0);
    assert.equal(step.streak, i + 1);
    assert.equal(step.streakBonusAtomic, "0");
  }
  const seventh = performCheckin(db, config, user.id, day0 + 6 * 86_400_000, () => 0);
  assert.equal(seventh.streak, 7);
  assert.equal(seventh.prizeCode, "secco");
  assert.equal(seventh.streakBonusAtomic, "10000000");
  const skipped = performCheckin(db, config, user.id, day0 + 9 * 86_400_000, () => 0);
  assert.equal(skipped.streak, 1);
});
