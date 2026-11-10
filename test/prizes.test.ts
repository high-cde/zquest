/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { CHECKIN_TABLE, prizeForRoll } from "../src/domain/prizes.js";
import { leaderboardDraft, noteDraft } from "../src/domain/draft.js";
import { formatAtomic, humanToAtomic } from "../src/domain/money.js";

test("la tabella del check-in copre ogni estrazione una sola volta", () => {
  assert.equal(
    CHECKIN_TABLE.reduce((sum, prize) => sum + prize.bps, 0),
    10_000,
  );
  const counts = new Map<string, number>();
  for (let roll = 0; roll < 10_000; roll++) {
    const prize = prizeForRoll(roll);
    counts.set(prize.code, (counts.get(prize.code) ?? 0) + 1);
  }
  for (const prize of CHECKIN_TABLE) {
    assert.equal(counts.get(prize.code), prize.bps, prize.code);
  }
});

test("i confini della tabella sono quelli pubblicati", () => {
  assert.equal(prizeForRoll(0).code, "secco");
  assert.equal(prizeForRoll(5999).code, "secco");
  assert.equal(prizeForRoll(6000).code, "scintilla");
  assert.equal(prizeForRoll(8499).code, "scintilla");
  assert.equal(prizeForRoll(8500).code, "mattone");
  assert.equal(prizeForRoll(9499).code, "mattone");
  assert.equal(prizeForRoll(9500).code, "stella");
  assert.equal(prizeForRoll(9899).code, "stella");
  assert.equal(prizeForRoll(9900).code, "zecca");
  assert.equal(prizeForRoll(9999).code, "zecca");
  assert.throws(() => prizeForRoll(10_000));
});

test("gli importi atomici rispettano i decimali letti on-chain", () => {
  assert.equal(humanToAtomic(5, 6), 5_000_000n);
  assert.equal(humanToAtomic(2, 18), 2_000_000_000_000_000_000n);
  assert.equal(formatAtomic(5_000_000n, 6), "5");
  assert.equal(formatAtomic(2_500_000n, 6), "2,5");
});

test("le bozze sono link intent, senza hype", () => {
  const draft = leaderboardDraft(["Salto: 1 mattonella 28 demo."]);
  assert.equal(draft.intentUrl.startsWith("https://x.com/intent/post?text="), true);
  assert.equal(draft.body.includes("senza rendimento promesso"), true);
  assert.equal(draft.body.includes("to the moon"), false);
  assert.throws(() => noteDraft("to the moon, rendimento sicuro"));
});
