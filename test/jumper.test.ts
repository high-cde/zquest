/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import { simulateJumper } from "../src/domain/jumper.js";

test("lo stesso seme e gli stessi salti danno lo stesso punteggio", () => {
  const left = simulateJumper("seme-fisso", [30, 70, 120]);
  const right = simulateJumper("seme-fisso", [30, 70, 120]);
  assert.equal(left.score, right.score);
  assert.equal(left.alive, right.alive);
});

test("senza salti si cade sul primo mattone e un salto giusto lo supera", () => {
  const crashed = simulateJumper("alfa", []);
  assert.equal(crashed.alive, false);
  let passed = false;
  for (let tick = 0; tick < 80; tick++) {
    const run = simulateJumper("alfa", [tick]);
    if (run.score > crashed.score) passed = true;
  }
  assert.equal(passed, true);
});

test("salti fuori ordine vengono rifiutati", () => {
  assert.throws(() => simulateJumper("alfa", [10, 10]));
  assert.throws(() => simulateJumper("alfa", [5, 4]));
});
