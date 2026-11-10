/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../src/db.js";
import { makeUser } from "./helpers.js";

test("due check-in contemporanei lasciano una sola riga", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zquest-"));
  const dbPath = path.join(dir, "race.sqlite");
  const db = openDatabase(dbPath);
  const user = makeUser(db, "Corsa");
  db.close();
  const run = () =>
    new Promise<number>((resolve) => {
      const child = spawn(process.execPath, ["test/race-worker.mjs", dbPath, String(user.id), "2026-11-01"], {
        cwd: process.cwd(),
      });
      child.on("exit", (code) => resolve(code ?? 1));
    });
  const codes = await Promise.all([run(), run()]);
  const check = openDatabase(dbPath);
  const count = check.prepare("SELECT COUNT(*) AS n FROM checkins").get() as { n: number };
  check.close();
  assert.equal(count.n, 1);
  assert.equal(codes.filter((code) => code === 0).length, 1);
  assert.ok(codes.every((code) => code === 0 || code === 2 || code === 3));
});
