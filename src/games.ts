/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { randomBytes, randomInt } from "node:crypto";
import { capAtomic, tokenOf, type Config } from "./config.js";
import { simulateJumper } from "./domain/jumper.js";
import { quizReward, reflexReward, saltoReward } from "./domain/prizes.js";
import { judgeReflex, reflexBlocked } from "./domain/reflex.js";
import { utcDay } from "./domain/time.js";
import { HttpError } from "./errors.js";
import { reserveReward } from "./budget.js";
import { withTx, type DB } from "./db.js";
import { pickQuestions, publicQuestion, scoreAnswers, QUESTIONS } from "./quiz.js";

export type IntRng = (maxExclusive: number) => number;
export const defaultIntRng: IntRng = (max) => randomInt(0, max);

type RunRow = {
  id: number;
  user_id: number;
  game: string;
  mode: string;
  seed: string | null;
  target_at: number | null;
  started_at: number;
  finished_at: number | null;
  score: number | null;
  day: string;
  state: string;
  payload: string | null;
};

function prepareRun(db: DB, userId: number, game: string, mode: string, day: string): void {
  if (mode === "classifica") {
    const locked = db
      .prepare("SELECT run_id FROM game_locks WHERE user_id = ? AND game = ? AND day = ?")
      .get(userId, game, day);
    if (locked) {
      throw new HttpError(409, "gia", "La manche in classifica di oggi è già chiusa. Resta disponibile la prova.");
    }
  }
  db.prepare("UPDATE game_runs SET state = 'annullata' WHERE user_id = ? AND game = ? AND state = 'open'").run(
    userId,
    game,
  );
}

function requireOpen(db: DB, userId: number, runId: number, game: string): RunRow {
  const run = db.prepare("SELECT * FROM game_runs WHERE id = ? AND user_id = ? AND game = ?").get(runId, userId, game) as
    | RunRow
    | undefined;
  if (!run) throw new HttpError(404, "manche", "Manche non trovata.");
  if (run.state !== "open") throw new HttpError(409, "manche", "Manche già chiusa.");
  return run;
}

function lockPrize(
  db: DB,
  config: Config,
  userId: number,
  game: string,
  day: string,
  runId: number,
  human: number,
  nowIso: string,
  mode: string,
): { amountAtomic: string; limit: string | null; claimId: number | null } {
  if (mode !== "classifica") return { amountAtomic: "0", limit: null, claimId: null };
  const existing = db
    .prepare("SELECT amount_atomic FROM game_locks WHERE user_id = ? AND game = ? AND day = ?")
    .get(userId, game, day) as { amount_atomic: string } | undefined;
  if (existing) return { amountAtomic: existing.amount_atomic, limit: null, claimId: null };
  const ov = tokenOf(config, "OV");
  const reserved = reserveReward(db, {
    userId,
    asset: "OV",
    day,
    human,
    decimals: ov.decimals,
    userCapAtomic: capAtomic(ov, "user"),
    globalCapAtomic: capAtomic(ov, "global"),
    reason: game,
    idempotencyKey: `ov:game:${game}:${userId}:${day}`,
    nowIso,
  });
  db.prepare(
    `INSERT INTO game_locks (user_id, game, day, run_id, amount_atomic) VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, game, day, runId, reserved.amountAtomic);
  return { amountAtomic: reserved.amountAtomic, limit: reserved.limit, claimId: reserved.claimId };
}

export function startReflex(
  db: DB,
  userId: number,
  mode: string,
  nowMs: number,
  intRng: IntRng = defaultIntRng,
): { id: number; serverNow: number; targetAt: number } {
  if (mode !== "prova" && mode !== "classifica") throw new HttpError(400, "modo", "Modo non valido.");
  const day = utcDay(nowMs);
  prepareRun(db, userId, "riflessi", mode, day);
  const delay = 1500 + intRng(2500);
  const targetAt = nowMs + delay;
  const result = db
    .prepare(
      `INSERT INTO game_runs (user_id, game, mode, target_at, started_at, day, state)
       VALUES (?, 'riflessi', ?, ?, ?, ?, 'open')`,
    )
    .run(userId, mode, targetAt, nowMs, day);
  return { id: Number(result.lastInsertRowid), serverNow: nowMs, targetAt };
}

export function tapReflex(
  db: DB,
  config: Config,
  userId: number,
  runId: number,
  nowMs: number,
): {
  ms: number;
  foul: boolean;
  slow: boolean;
  suspicious: boolean;
  amountAtomic: string;
  limit: string | null;
  ranked: boolean;
} {
  return withTx(db, () => {
    const run = requireOpen(db, userId, runId, "riflessi");
    if (run.target_at === null) throw new HttpError(409, "manche", "Manche senza segnale.");
    const judged = judgeReflex(run.target_at, nowMs);
    const blocked = reflexBlocked(judged);
    const human = reflexReward(judged.ms, blocked);
    const nowIso = new Date(nowMs).toISOString();
    const prize = lockPrize(db, config, userId, "riflessi", run.day, run.id, human, nowIso, run.mode);
    const score = blocked ? null : judged.ms;
    db.prepare(
      `UPDATE game_runs SET state = 'done', finished_at = ?, score = ? WHERE id = ?`,
    ).run(nowMs, score, run.id);
    if (run.mode === "classifica" && score !== null) {
      db.prepare("INSERT INTO scores (user_id, game, score, created_at) VALUES (?, 'riflessi', ?, ?)").run(
        userId,
        score,
        nowIso,
      );
    }
    return {
      ms: judged.ms,
      foul: judged.foul,
      slow: judged.slow,
      suspicious: judged.suspicious,
      amountAtomic: prize.amountAtomic,
      limit: prize.limit,
      ranked: run.mode === "classifica",
    };
  });
}

export function startSalto(db: DB, userId: number, mode: string, nowMs: number): { id: number; seed: string } {
  if (mode !== "prova" && mode !== "classifica") throw new HttpError(400, "modo", "Modo non valido.");
  const day = utcDay(nowMs);
  prepareRun(db, userId, "salto", mode, day);
  const seed = randomBytes(8).toString("hex");
  const result = db
    .prepare(
      `INSERT INTO game_runs (user_id, game, mode, seed, started_at, day, state)
       VALUES (?, 'salto', ?, ?, ?, ?, 'open')`,
    )
    .run(userId, mode, seed, nowMs, day);
  return { id: Number(result.lastInsertRowid), seed };
}

export function finishSalto(
  db: DB,
  config: Config,
  userId: number,
  runId: number,
  jumps: number[],
  nowMs: number,
): { score: number; amountAtomic: string; limit: string | null; ranked: boolean } {
  return withTx(db, () => {
    const run = requireOpen(db, userId, runId, "salto");
    if (!run.seed) throw new HttpError(409, "manche", "Manche senza seme.");
    let state;
    try {
      state = simulateJumper(run.seed, jumps);
    } catch {
      throw new HttpError(400, "salti", "Sequenza di salti non valida.");
    }
    const human = saltoReward(state.score);
    const nowIso = new Date(nowMs).toISOString();
    const prize = lockPrize(db, config, userId, "salto", run.day, run.id, human, nowIso, run.mode);
    db.prepare("UPDATE game_runs SET state = 'done', finished_at = ?, score = ? WHERE id = ?").run(
      nowMs,
      state.score,
      run.id,
    );
    if (run.mode === "classifica") {
      db.prepare("INSERT INTO scores (user_id, game, score, created_at) VALUES (?, 'salto', ?, ?)").run(
        userId,
        state.score,
        nowIso,
      );
    }
    return { score: state.score, amountAtomic: prize.amountAtomic, limit: prize.limit, ranked: run.mode === "classifica" };
  });
}

export function startQuiz(
  db: DB,
  userId: number,
  mode: string,
  nowMs: number,
  intRng: IntRng = defaultIntRng,
): { id: number; questions: Array<{ id: string; prompt: string; choices: string[] }> } {
  if (mode !== "prova" && mode !== "classifica") throw new HttpError(400, "modo", "Modo non valido.");
  const day = utcDay(nowMs);
  prepareRun(db, userId, "quiz", mode, day);
  const questions = pickQuestions(intRng, 5);
  const result = db
    .prepare(
      `INSERT INTO game_runs (user_id, game, mode, payload, started_at, day, state)
       VALUES (?, 'quiz', ?, ?, ?, ?, 'open')`,
    )
    .run(userId, mode, JSON.stringify(questions.map((question) => question.id)), nowMs, day);
  return { id: Number(result.lastInsertRowid), questions: questions.map(publicQuestion) };
}

export function finishQuiz(
  db: DB,
  config: Config,
  userId: number,
  runId: number,
  answers: Array<{ id: string; choice: number }>,
  nowMs: number,
): {
  score: number;
  total: number;
  corrections: Array<{ id: string; ok: boolean; answer: number }>;
  amountAtomic: string;
  limit: string | null;
  ranked: boolean;
} {
  return withTx(db, () => {
    const run = requireOpen(db, userId, runId, "quiz");
    const ids = JSON.parse(run.payload ?? "[]") as string[];
    const questions = ids.map((id) => {
      const found = QUESTIONS.find((question) => question.id === id);
      if (!found) throw new HttpError(409, "quiz", "Domande mancanti.");
      return found;
    });
    let scored: { score: number; corrections: Array<{ id: string; ok: boolean; answer: number }> };
    try {
      scored = scoreAnswers(questions, answers);
    } catch {
      throw new HttpError(400, "quiz", "Risposte non valide.");
    }
    const human = quizReward(scored.score);
    const nowIso = new Date(nowMs).toISOString();
    const prize = lockPrize(db, config, userId, "quiz", run.day, run.id, human, nowIso, run.mode);
    db.prepare("UPDATE game_runs SET state = 'done', finished_at = ?, score = ? WHERE id = ?").run(
      nowMs,
      scored.score,
      run.id,
    );
    if (run.mode === "classifica") {
      db.prepare("INSERT INTO scores (user_id, game, score, created_at) VALUES (?, 'quiz', ?, ?)").run(
        userId,
        scored.score,
        nowIso,
      );
    }
    return {
      score: scored.score,
      total: questions.length,
      corrections: scored.corrections,
      amountAtomic: prize.amountAtomic,
      limit: prize.limit,
      ranked: run.mode === "classifica",
    };
  });
}

export function rankedToday(db: DB, userId: number, day: string): Record<string, boolean> {
  const rows = db
    .prepare("SELECT game FROM game_locks WHERE user_id = ? AND day = ?")
    .all(userId, day) as Array<{ game: string }>;
  const locked = new Set(rows.map((row) => row.game));
  return {
    riflessi: locked.has("riflessi"),
    salto: locked.has("salto"),
    quiz: locked.has("quiz"),
  };
}

export function gamesCompleted(db: DB, userId: number): boolean {
  const rows = db
    .prepare(
      `SELECT DISTINCT game FROM game_runs
       WHERE user_id = ? AND mode = 'classifica' AND state = 'done' AND game IN ('riflessi','salto','quiz')`,
    )
    .all(userId) as Array<{ game: string }>;
  return rows.length === 3;
}

export function leaderboard(db: DB, game: string, sinceIso: string | null, limit = 20) {
  const higher = game !== "riflessi";
  const order = higher ? "DESC" : "ASC";
  const params: Array<string | number> = [game];
  let timeSql = "";
  if (sinceIso) {
    timeSql = " AND s.created_at >= ?";
    params.push(sinceIso);
  }
  params.push(limit);
  return db
    .prepare(
      `SELECT u.id AS userId, u.display_name AS displayName, u.username, u.demo AS demo,
              ${higher ? "MAX" : "MIN"}(s.score) AS score
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.game = ?${timeSql}
       GROUP BY u.id
       ORDER BY score ${order}
       LIMIT ?`,
    )
    .all(...params) as Array<{
    userId: number;
    displayName: string | null;
    username: string | null;
    demo: number;
    score: number;
  }>;
}
