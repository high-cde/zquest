/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { declareAge, reactTo, saveProfile, setOptIn, textAllowed } from "../src/dating.js";
import { HttpError } from "../src/errors.js";
import { makeUser, testConfig, testDb } from "./helpers.js";

const bio = "Mi piace camminare al mattino e cucinare senza fretta.";

test("senza autodichiarazione il profilo incontri non si apre", () => {
  const { db, config } = testDb();
  const user = makeUser(db);
  assert.throws(
    () => saveProfile(db, user, { bio, interests: ["musica"] }, config.termsVersion, "2026-11-07T00:00:00.000Z"),
    (error: unknown) => error instanceof HttpError && error.status === 403,
  );
});

test("chi dichiara meno di 18 anni resta fuori e non può correggere", () => {
  const { db, config } = testDb();
  const user = makeUser(db, "Giovane");
  assert.throws(() =>
    declareAge(
      db,
      user,
      { years: 16, acceptTerms: true, confirmSelfDeclaration: true },
      config,
      "2026-11-07T00:00:00.000Z",
    ),
  );
  const locked = db.prepare("SELECT age_gate FROM users WHERE id = ?").get(user.id) as { age_gate: string };
  assert.equal(locked.age_gate, "under");
  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id) as typeof user;
  assert.throws(() =>
    declareAge(
      db,
      fresh,
      { years: 21, acceptTerms: true, confirmSelfDeclaration: true },
      config,
      "2026-11-07T01:00:00.000Z",
    ),
  );
});

test("il like non crea premi e il match chiede il consenso di entrambi", () => {
  const { db, config } = testDb();
  const left = makeUser(db, "Sinistra");
  const right = makeUser(db, "Destra");
  for (const user of [left, right]) {
    declareAge(
      db,
      user,
      { years: 28, acceptTerms: true, confirmSelfDeclaration: true },
      config,
      "2026-11-07T00:00:00.000Z",
    );
  }
  const leftFresh = db.prepare("SELECT * FROM users WHERE id = ?").get(left.id) as typeof left;
  const rightFresh = db.prepare("SELECT * FROM users WHERE id = ?").get(right.id) as typeof right;
  setOptIn(db, leftFresh, true, config.termsVersion);
  setOptIn(db, rightFresh, true, config.termsVersion);
  const optedLeft = db.prepare("SELECT * FROM users WHERE id = ?").get(left.id) as typeof left;
  const optedRight = db.prepare("SELECT * FROM users WHERE id = ?").get(right.id) as typeof right;
  saveProfile(db, optedLeft, { bio, interests: ["musica"] }, config.termsVersion, "2026-11-07T00:00:00.000Z");
  saveProfile(db, optedRight, { bio, interests: ["lettura"] }, config.termsVersion, "2026-11-07T00:00:00.000Z");
  const before = (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
  const one = reactTo(db, optedLeft, right.id, "like", config.termsVersion, "2026-11-07T00:00:00.000Z");
  assert.equal(one.matched, false);
  const two = reactTo(db, optedRight, left.id, "like", config.termsVersion, "2026-11-07T00:01:00.000Z");
  assert.equal(two.matched, true);
  const after = (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
  const ledger = (db.prepare("SELECT COUNT(*) AS n FROM ledger").get() as { n: number }).n;
  assert.equal(after, before);
  assert.equal(ledger, 0);
});

test("il filtro blocca un testo esplicito e lascia passare una parola innocua", () => {
  assert.equal(textAllowed("Ci vediamo in hotel vicino al parco."), true);
  assert.equal(textAllowed("Cerco un incontro hot stasera."), false);
  assert.equal(textAllowed("Scrivimi su https://example.com"), false);
});
