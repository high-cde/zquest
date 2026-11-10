/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { randomInt } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { capAtomic, tokenOf, type Config } from "./config.js";
import { formatAtomic } from "./domain/money.js";
import {
  CHECKIN_TABLE,
  DSN_QUEST_HUMAN,
  STREAK_BONUS_HUMAN,
  STREAK_EVERY_DAYS,
  describePrize,
} from "./domain/prizes.js";
import { utcDay, utcWeekStartIso } from "./domain/time.js";
import { leaderboardDraft, noteDraft, winnersDraft } from "./domain/draft.js";
import { HttpError } from "./errors.js";
import {
  confirmPolygon,
  confirmSiws,
  preparePolygon,
  prepareSiws,
  safeEqual,
  userFromAuth,
  verifyTelegramInitData,
} from "./auth.js";
import { budgetView, syncFunding } from "./budget.js";
import { approveBatch, defaultSender, rejectQueued, unlockSettling, type Sender } from "./claims.js";
import { performCheckin } from "./checkin.js";
import { openDatabase, type Claim, type DB, type User } from "./db.js";
import {
  INTERESTS,
  blockUser,
  datingState,
  declareAge,
  discover,
  listMatches,
  ownProfile,
  reactTo,
  reportUser,
  saveProfile,
  setOptIn,
} from "./dating.js";
import { finishQuiz, finishSalto, leaderboard, rankedToday, startQuiz, startReflex, startSalto, tapReflex } from "./games.js";
import { GUIDE } from "./guide.js";
import { rateLimit } from "./rate.js";
import {
  claimReadyQuest,
  decideGithub,
  listQuests,
  markGuide,
  redeemInvite,
  submitGithub,
} from "./quests.js";
import { anonymizeAccount, createDemoUser, displayOf, eraseDating, requireUser, upsertTelegramUser } from "./users.js";
import { signSession } from "./auth.js";
import { registerAirdropRoutes, seedAirdrop, syncRewardsLiveFlag } from "./airdrop.js";

export type AppOptions = {
  config: Config;
  db?: DB;
  logger?: boolean;
  now?: () => number;
  sender?: Sender;
  airdropSender?: import("./airdrop.js").AirdropSender;
  publicDir?: string;
};

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const config = options.config;
  const db = options.db ?? openDatabase(config.databasePath);
  const now = () => options.now?.() ?? Date.now();
  const sender = options.sender ?? defaultSender;
  const bootIso = new Date(now()).toISOString();
  syncFunding(db, "OV", config.ov.budgetHuman, config.ov.decimals, bootIso);
  syncFunding(db, "DSN", config.dsn.budgetHuman, config.dsn.decimals, bootIso);
  seedAirdrop(db, config);
  syncRewardsLiveFlag(db, config.rewardsLive);

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      const message = error instanceof Error ? error.message : "Richiesta non valida.";
      return reply.code(statusCode).send({ error: { code: "richiesta", message } });
    }
    request.log.error(error);
    return reply.code(500).send({ error: { code: "interno", message: "Errore interno." } });
  });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; base-uri 'self'; object-src 'none'",
    );
  });

  const authUser = (request: FastifyRequest): User => {
    const header = request.headers.authorization;
    const user = userFromAuth(db, config, typeof header === "string" ? header : undefined, now());
    if (!user) throw new HttpError(401, "sessione", "Serve una sessione.");
    return requireUser(db, user.id);
  };

  const guard = (key: string, limit: number, windowMs: number) => {
    if (!rateLimit(db, key, limit, windowMs, now())) {
      throw new HttpError(429, "calma", "Troppe richieste. Riprova tra poco.");
    }
  };

  app.get("/api/health", async () => ({
    ok: true,
    bot: config.botMode,
    rewardsLive: config.rewardsLive,
    decimals: {
      ov: { value: config.ov.decimals, source: config.ov.decimalsSource },
      dsn: { value: config.dsn.decimals, source: config.dsn.decimalsSource },
    },
  }));

  app.get("/api/pubblico", async () => publicPayload(db, config, utcDay(now())));

  app.post("/api/demo/entra", async (request) => {
    if (!config.allowDemo) throw new HttpError(403, "demo", "L'ingresso dimostrativo è spento.");
    guard(`demo:${ipOf(request)}`, 20, 60 * 60 * 1000);
    const name = stringField(bodyOf(request), "name");
    const user = createDemoUser(db, name, new Date(now()).toISOString());
    return { token: signSession(config.sessionSecret, user.id, now()), user: mePayload(db, config, user, now()) };
  });

  app.post("/api/telegram", async (request) => {
    if (!config.botToken) throw new HttpError(503, "bot", "BOT_TOKEN non configurato.");
    const initData = stringField(bodyOf(request), "initData");
    const telegram = verifyTelegramInitData(initData, config.botToken, now());
    if (!telegram) throw new HttpError(401, "telegram", "Dati Telegram non validi.");
    const user = upsertTelegramUser(db, telegram, new Date(now()).toISOString());
    if (user.banned) throw new HttpError(403, "sospeso", "Profilo sospeso dalla moderazione.");
    return { token: signSession(config.sessionSecret, user.id, now()), user: mePayload(db, config, user, now()) };
  });

  app.get("/api/me", async (request) => mePayload(db, config, authUser(request), now()));

  app.post("/api/me/cancella", async (request) => {
    const user = authUser(request);
    const body = bodyOf(request);
    if (body.confirm !== "CANCELLA") throw new HttpError(400, "conferma", "Scrivi CANCELLA per confermare.");
    if (body.scope === "incontri") {
      eraseDating(db, user.id);
      return { ok: true, scope: "incontri" };
    }
    if (body.scope === "account") {
      anonymizeAccount(db, user.id, new Date(now()).toISOString());
      return { ok: true, scope: "account" };
    }
    throw new HttpError(400, "ambito", "Ambito non valido.");
  });

  app.post("/api/siws/prepara", async (request) => {
    const user = authUser(request);
    guard(`siws:${user.id}`, 20, 60 * 60 * 1000);
    const body = bodyOf(request);
    return prepareSiws(db, config, user.id, stringField(body, "address"), now(), {
      domain: stringField(body, "domain"),
      uri: stringField(body, "uri"),
    });
  });

  app.post("/api/siws/verifica", async (request) => {
    const user = authUser(request);
    const body = bodyOf(request);
    const result = confirmSiws(db, user.id, stringField(body, "message"), stringField(body, "signature"), now());
    return result;
  });

  app.post("/api/polygon/prepara", async (request) => {
    const user = authUser(request);
    guard(`pol:${user.id}`, 20, 60 * 60 * 1000);
    return preparePolygon(db, user.id, stringField(bodyOf(request), "address"), now());
  });

  app.post("/api/polygon/verifica", async (request) => {
    const user = authUser(request);
    const body = bodyOf(request);
    return confirmPolygon(db, user.id, stringField(body, "message"), stringField(body, "signature"), now());
  });

  app.post("/api/checkin", async (request) => {
    const user = authUser(request);
    guard(`checkin:${user.id}`, 10, 60 * 60 * 1000);
    const result = performCheckin(db, config, user.id, now(), () => randomInt(0, 10_000));
    return {
      ...result,
      amount: formatAtomic(result.amountAtomic, config.ov.decimals),
      streakBonus: formatAtomic(result.streakBonusAtomic, config.ov.decimals),
      prizeLabel: describePrize(result.prizeCode),
      paidLabel: describePrize(result.paidCode),
    };
  });

  app.get("/api/classifica", async (request) => {
    const query = request.query as { gioco?: string; periodo?: string };
    const game = query.gioco ?? "salto";
    if (!["riflessi", "salto", "quiz"].includes(game)) throw new HttpError(400, "gioco", "Gioco non valido.");
    const since = query.periodo === "sempre" ? null : utcWeekStartIso(now());
    const rows = leaderboard(db, game, since, 20).map((row) => ({
      userId: row.userId,
      name: row.displayName || row.username || `socio-${row.userId}`,
      score: row.score,
      demo: row.demo === 1,
    }));
    return { game, period: since ? "settimana" : "sempre", order: game === "riflessi" ? "asc" : "desc", rows };
  });

  app.post("/api/giochi/riflessi", async (request) => {
    const user = authUser(request);
    guard(`game:${user.id}`, 40, 60 * 60 * 1000);
    const mode = modeOf(bodyOf(request));
    return startReflex(db, user.id, mode, now());
  });

  app.post("/api/giochi/riflessi/:id", async (request) => {
    const user = authUser(request);
    const result = tapReflex(db, config, user.id, idParam(request), now());
    return { ...result, amount: formatAtomic(result.amountAtomic, config.ov.decimals) };
  });

  app.post("/api/giochi/salto", async (request) => {
    const user = authUser(request);
    guard(`game:${user.id}`, 40, 60 * 60 * 1000);
    return startSalto(db, user.id, modeOf(bodyOf(request)), now());
  });

  app.post("/api/giochi/salto/:id", async (request) => {
    const user = authUser(request);
    const jumps = bodyOf(request).jumps;
    if (!Array.isArray(jumps) || jumps.some((item) => typeof item !== "number")) {
      throw new HttpError(400, "salti", "Elenco salti non valido.");
    }
    const result = finishSalto(db, config, user.id, idParam(request), jumps, now());
    return { ...result, amount: formatAtomic(result.amountAtomic, config.ov.decimals) };
  });

  app.post("/api/giochi/quiz", async (request) => {
    const user = authUser(request);
    guard(`game:${user.id}`, 40, 60 * 60 * 1000);
    return startQuiz(db, user.id, modeOf(bodyOf(request)), now());
  });

  app.post("/api/giochi/quiz/:id", async (request) => {
    const user = authUser(request);
    const answers = bodyOf(request).answers;
    if (!Array.isArray(answers)) throw new HttpError(400, "quiz", "Risposte mancanti.");
    const parsed = answers.map((item) => {
      if (!item || typeof item !== "object") throw new HttpError(400, "quiz", "Risposta non valida.");
      const row = item as { id?: unknown; choice?: unknown };
      if (typeof row.id !== "string" || typeof row.choice !== "number") {
        throw new HttpError(400, "quiz", "Risposta non valida.");
      }
      return { id: row.id, choice: row.choice };
    });
    const result = finishQuiz(db, config, user.id, idParam(request), parsed, now());
    return { ...result, amount: formatAtomic(result.amountAtomic, config.ov.decimals) };
  });

  app.get("/api/quest", async (request) => listQuests(db, authUser(request)));

  app.post("/api/quest/riscuoti", async (request) => {
    const user = authUser(request);
    const code = stringField(bodyOf(request), "code");
    if (code !== "guida" && code !== "giochi" && code !== "zswap") {
      throw new HttpError(400, "quest", "Quest non riscuotibile da qui.");
    }
    const result = claimReadyQuest(db, config, user, code, now());
    return { ...result, amount: formatAtomic(result.amountAtomic, config.dsn.decimals) };
  });

  app.post("/api/quest/github", async (request) => {
    const user = authUser(request);
    submitGithub(db, user.id, stringField(bodyOf(request), "url"), new Date(now()).toISOString());
    return { status: "in_revisione" };
  });

  app.post("/api/quest/invito", async (request) => {
    const user = authUser(request);
    return redeemInvite(db, user, stringField(bodyOf(request), "code"), config, now());
  });

  app.get("/api/guida", async (request) => {
    const header = request.headers.authorization;
    const maybe = userFromAuth(db, config, typeof header === "string" ? header : undefined, now());
    const seen = new Set<string>();
    if (maybe) {
      const rows = db.prepare("SELECT section FROM guide_seen WHERE user_id = ?").all(maybe.id) as Array<{
        section: string;
      }>;
      for (const row of rows) seen.add(row.section);
    }
    return {
      sections: GUIDE.map((section) => ({
        id: section.id,
        title: section.title,
        paragraphs: section.paragraphs,
        seen: seen.has(section.id),
      })),
    };
  });

  app.post("/api/guida/:id", async (request) => {
    const user = authUser(request);
    markGuide(db, user.id, (request.params as { id: string }).id, new Date(now()).toISOString());
    return { ok: true };
  });

  app.get("/api/incontri", async (request) => {
    const user = authUser(request);
    return {
      ...datingState(user, config.termsVersion),
      interests: INTERESTS,
      profile: ownProfile(db, user.id),
      shareUsername: user.share_username === 1,
    };
  });

  app.post("/api/incontri/dichiarazione", async (request) => {
    const user = authUser(request);
    const body = bodyOf(request);
    declareAge(
      db,
      user,
      {
        years: typeof body.years === "number" ? body.years : Number.NaN,
        acceptTerms: body.acceptTerms === true,
        confirmSelfDeclaration: body.confirmSelfDeclaration === true,
      },
      config,
      new Date(now()).toISOString(),
    );
    return { ok: true };
  });

  app.post("/api/incontri/partecipa", async (request) => {
    const user = authUser(request);
    const optIn = bodyOf(request).optIn === true;
    setOptIn(db, requireUser(db, user.id), optIn, config.termsVersion);
    return { ok: true };
  });

  app.put("/api/incontri/profilo", async (request) => {
    const user = requireUser(db, authUser(request).id);
    const body = bodyOf(request);
    const interests = Array.isArray(body.interests) ? body.interests.filter((item) => typeof item === "string") : [];
    saveProfile(
      db,
      user,
      {
        bio: typeof body.bio === "string" ? body.bio : "",
        interests: interests as string[],
        city: typeof body.city === "string" ? body.city : "",
        shareUsername: body.shareUsername === true,
      },
      config.termsVersion,
      new Date(now()).toISOString(),
    );
    return { ok: true };
  });

  app.get("/api/incontri/scopri", async (request) => {
    const user = requireUser(db, authUser(request).id);
    return { profile: discover(db, user, config.termsVersion) };
  });

  app.post("/api/incontri/scelta", async (request) => {
    const user = requireUser(db, authUser(request).id);
    guard(`dating:${user.id}`, 40, 60 * 60 * 1000);
    const body = bodyOf(request);
    const kind = body.kind === "pass" ? "pass" : body.kind === "like" ? "like" : null;
    if (!kind || typeof body.userId !== "number") throw new HttpError(400, "scelta", "Scelta non valida.");
    const before = (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
    const result = reactTo(db, user, body.userId, kind, config.termsVersion, new Date(now()).toISOString());
    const after = (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
    if (after !== before) throw new Error("gli incontri non possono creare premi");
    return result;
  });

  app.post("/api/incontri/blocca", async (request) => {
    const user = requireUser(db, authUser(request).id);
    const userId = bodyOf(request).userId;
    if (typeof userId !== "number") throw new HttpError(400, "blocco", "Profilo non valido.");
    blockUser(db, user, userId, config.termsVersion, new Date(now()).toISOString());
    return { ok: true };
  });

  app.post("/api/incontri/segnala", async (request) => {
    const user = requireUser(db, authUser(request).id);
    guard(`report:${user.id}`, 10, 24 * 60 * 60 * 1000);
    const body = bodyOf(request);
    if (typeof body.userId !== "number" || typeof body.reason !== "string") {
      throw new HttpError(400, "segnalazione", "Segnalazione non valida.");
    }
    reportUser(db, user, body.userId, body.reason, config.termsVersion, new Date(now()).toISOString());
    return { ok: true };
  });

  app.get("/api/incontri/match", async (request) => {
    const user = requireUser(db, authUser(request).id);
    return { matches: listMatches(db, user, config.termsVersion) };
  });

  app.delete("/api/incontri", async (request) => {
    eraseDating(db, authUser(request).id);
    return { ok: true };
  });

  app.get("/api/admin/riepilogo", async (request) => {
    requireAdmin(request, config);
    const day = utcDay(now());
    return {
      rewardsLive: config.rewardsLive,
      users: (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n,
      queued: (db.prepare("SELECT COUNT(*) AS n FROM claims WHERE status = 'queued'").get() as { n: number }).n,
      reports: (db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").get() as { n: number }).n,
      drafts: (db.prepare("SELECT COUNT(*) AS n FROM drafts WHERE status = 'draft'").get() as { n: number }).n,
      budget: {
        ov: viewToken(db, "OV", day, config.ov.decimals),
        dsn: viewToken(db, "DSN", day, config.dsn.decimals),
      },
    };
  });

  app.get("/api/admin/coda", async (request) => {
    requireAdmin(request, config);
    const rows = db
      .prepare(
        `SELECT c.*, u.display_name, u.username, u.wallet, u.polygon_wallet
         FROM claims c JOIN users u ON u.id = c.user_id
         ORDER BY c.id DESC LIMIT 100`,
      )
      .all() as Array<Claim & { display_name: string | null; username: string | null; wallet: string | null; polygon_wallet: string | null }>;
    return {
      rewardsLive: config.rewardsLive,
      claims: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.display_name || row.username || `socio-${row.user_id}`,
        asset: row.asset,
        amount: formatAtomic(row.amount_atomic, tokenOf(config, row.asset === "DSN" ? "DSN" : "OV").decimals),
        amountAtomic: row.amount_atomic,
        status: row.status,
        reason: row.reason,
        day: row.day,
        destination: row.destination,
        walletReady: row.asset === "OV" ? Boolean(row.wallet) : Boolean(row.polygon_wallet),
        detail: row.detail,
        txRef: row.tx_ref,
      })),
    };
  });

  app.post("/api/admin/coda/approva", async (request) => {
    requireAdmin(request, config);
    const ids = idList(bodyOf(request));
    return { results: await approveBatch(db, config, ids, sender, now()) };
  });

  app.post("/api/admin/coda/rifiuta", async (request) => {
    requireAdmin(request, config);
    const body = bodyOf(request);
    const detail = typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 180) : "rifiutato";
    return { changed: rejectQueued(db, idList(body), detail, now()) };
  });

  app.post("/api/admin/coda/sblocca", async (request) => {
    requireAdmin(request, config);
    return { changed: unlockSettling(db, idList(bodyOf(request)), now()) };
  });

  app.get("/api/admin/bozze", async (request) => {
    requireAdmin(request, config);
    return {
      drafts: db
        .prepare("SELECT id, kind, body, intent_url AS intentUrl, status, created_at AS createdAt FROM drafts ORDER BY id DESC LIMIT 50")
        .all(),
    };
  });

  app.post("/api/admin/bozze", async (request) => {
    requireAdmin(request, config);
    const body = bodyOf(request);
    const kind = typeof body.kind === "string" ? body.kind : "";
    let draft: { body: string; intentUrl: string };
    try {
      if (kind === "classifica") draft = leaderboardDraft(weeklyLines(db, now()));
      else if (kind === "vincitori") draft = winnersDraft(winnerLines(db, config, now()));
      else if (kind === "nota") draft = noteDraft(typeof body.nota === "string" ? body.nota : "");
      else throw new HttpError(400, "bozza", "Tipo di bozza non valido.");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "bozza", error instanceof Error ? error.message : "Bozza rifiutata.");
    }
    const result = db
      .prepare("INSERT INTO drafts (kind, body, intent_url, status, created_at) VALUES (?, ?, ?, 'draft', ?)")
      .run(kind, draft.body, draft.intentUrl, new Date(now()).toISOString());
    return { id: Number(result.lastInsertRowid), ...draft, status: "draft" };
  });

  app.post("/api/admin/bozze/:id/archivia", async (request) => {
    requireAdmin(request, config);
    db.prepare("UPDATE drafts SET status = 'archived' WHERE id = ?").run(idParam(request));
    return { ok: true };
  });

  app.get("/api/admin/segnalazioni", async (request) => {
    requireAdmin(request, config);
    return {
      reports: db
        .prepare(
          `SELECT r.id, r.reason, r.status, r.created_at AS createdAt, r.target_id AS targetId,
                  u.display_name AS targetName
           FROM reports r LEFT JOIN users u ON u.id = r.target_id
           ORDER BY r.id DESC LIMIT 100`,
        )
        .all(),
    };
  });

  app.post("/api/admin/segnalazioni/:id", async (request) => {
    requireAdmin(request, config);
    const action = bodyOf(request).action;
    const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(idParam(request)) as
      | { id: number; target_id: number }
      | undefined;
    if (!report) throw new HttpError(404, "segnalazione", "Segnalazione assente.");
    const nowIso = new Date(now()).toISOString();
    if (action === "ban") {
      db.prepare("UPDATE users SET banned = 1, dating_opt_in = 0 WHERE id = ?").run(report.target_id);
      db.prepare("UPDATE dating_profiles SET visible = 0 WHERE user_id = ?").run(report.target_id);
      db.prepare("UPDATE reports SET status = 'actioned' WHERE id = ?").run(report.id);
      db.prepare("INSERT INTO audit (action, detail, created_at) VALUES ('ban', ?, ?)").run(
        String(report.target_id),
        nowIso,
      );
      return { ok: true };
    }
    if (action === "dismiss") {
      db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(report.id);
      return { ok: true };
    }
    throw new HttpError(400, "azione", "Azione non valida.");
  });

  app.get("/api/admin/quest", async (request) => {
    requireAdmin(request, config);
    return {
      github: db
        .prepare(
          `SELECT q.id, q.user_id AS userId, q.status, q.evidence, q.created_at AS createdAt, u.display_name AS name
           FROM quest_progress q JOIN users u ON u.id = q.user_id
           WHERE q.code = 'github' ORDER BY q.id DESC LIMIT 50`,
        )
        .all(),
    };
  });

  app.post("/api/admin/quest/github", async (request) => {
    requireAdmin(request, config);
    const body = bodyOf(request);
    if (typeof body.id !== "number" || typeof body.accept !== "boolean") {
      throw new HttpError(400, "quest", "Revisione non valida.");
    }
    return decideGithub(db, config, body.id, body.accept, now());
  });

  registerAirdropRoutes(app, {
    db,
    config,
    now,
    sender: options.airdropSender,
    authUser,
    guard,
    ipOf,
    requireAdmin: (request) => requireAdmin(request, config),
  });

  const publicDir = options.publicDir ?? path.resolve(process.cwd(), "dist/public");
  if (existsSync(path.join(publicDir, "index.html"))) {
    await app.register(fastifyStatic, { root: publicDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/telegram")) {
        return reply.code(404).send({ error: { code: "assente", message: "Percorso non trovato." } });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

function publicPayload(db: DB, config: Config, day: string) {
  let cursor = 0;
  const checkin = CHECKIN_TABLE.map((prize) => {
    const from = cursor;
    cursor += prize.bps;
    return {
      code: prize.code,
      label: prize.label,
      human: prize.human,
      bps: prize.bps,
      percent: prize.bps / 100,
      from,
      to: cursor - 1,
    };
  });
  return {
    name: "ZQuest",
    rewardsLive: config.rewardsLive,
    allowDemo: config.allowDemo,
    termsVersion: config.termsVersion,
    privacyContact: config.privacyContact,
    links: { zswap: "https://swap.x-zdos.it", self: config.publicBaseUrl },
    disclaimers: [
      "Omaggi gratuiti: nessuna puntata e nessun pagamento per giocare.",
      "$OV e $DSN sono valute di comunità. Nessun rendimento promesso.",
      "Gli invii on-chain richiedono approvazione e REWARDS_LIVE. Altrimenti restano in prova.",
      "Gli incontri sono 18+ in beta, separati dai premi: niente gettoni e niente pagamenti.",
    ],
    checkin,
    streak: { every: STREAK_EVERY_DAYS, human: STREAK_BONUS_HUMAN },
    games: {
      riflessi: [
        { label: "Fino a 220 ms", human: 12 },
        { label: "Fino a 320 ms", human: 6 },
        { label: "Fino a 450 ms", human: 2 },
      ],
      salto: [
        { label: "40 o più mattoni", human: 15 },
        { label: "20 o più", human: 8 },
        { label: "8 o più", human: 3 },
      ],
      quiz: [
        { label: "5 giuste", human: 12 },
        { label: "4 giuste", human: 8 },
        { label: "3 giuste", human: 4 },
      ],
    },
    quests: DSN_QUEST_HUMAN,
    ov: tokenPublic(db, config, "OV", day),
    dsn: tokenPublic(db, config, "DSN", day),
  };
}

function tokenPublic(db: DB, config: Config, asset: "OV" | "DSN", day: string) {
  const token = tokenOf(config, asset);
  const view = budgetView(db, asset, day, token.decimals);
  const userCap = capAtomic(token, "user");
  const globalCap = capAtomic(token, "global");
  const today = BigInt(view.todayAtomic);
  return {
    symbol: token.symbol,
    name: token.name,
    address: token.address,
    decimals: token.decimals,
    decimalsSource: token.decimalsSource,
    program: token.program,
    userCap: formatAtomic(userCap, token.decimals),
    globalCap: formatAtomic(globalCap, token.decimals),
    todaySpent: formatAtomic(today, token.decimals),
    todayRemaining: formatAtomic(globalCap > today ? globalCap - today : 0n, token.decimals),
    budgetRemaining: formatAtomic(view.remainingAtomic, token.decimals),
  };
}

function viewToken(db: DB, asset: "OV" | "DSN", day: string, decimals: number) {
  const view = budgetView(db, asset, day, decimals);
  return {
    funded: formatAtomic(view.fundedAtomic, decimals),
    spent: formatAtomic(view.spentAtomic, decimals),
    remaining: formatAtomic(view.remainingAtomic, decimals),
    today: formatAtomic(view.todayAtomic, decimals),
  };
}

function mePayload(db: DB, config: Config, user: User, nowMs: number) {
  const day = utcDay(nowMs);
  const claims = db
    .prepare(
      "SELECT id, asset, amount_atomic, status, reason, day, tx_ref FROM claims WHERE user_id = ? ORDER BY id DESC LIMIT 20",
    )
    .all(user.id) as Array<{
    id: number;
    asset: string;
    amount_atomic: string;
    status: string;
    reason: string;
    day: string;
    tx_ref: string | null;
  }>;
  return {
    id: user.id,
    displayName: displayOf(user),
    username: user.username,
    demo: user.demo === 1,
    streak: user.streak,
    lastCheckinDay: user.last_checkin_day,
    checkinToday: user.last_checkin_day === day,
    wallet: user.wallet,
    polygonWallet: user.polygon_wallet,
    inviteCode: user.invite_code,
    locks: rankedToday(db, user.id, day),
    shareUsername: user.share_username === 1,
    claims: claims.map((claim) => ({
      id: claim.id,
      asset: claim.asset,
      amount: formatAtomic(claim.amount_atomic, tokenOf(config, claim.asset === "DSN" ? "DSN" : "OV").decimals),
      status: claim.status,
      reason: claim.reason,
      day: claim.day,
      txRef: claim.tx_ref,
    })),
  };
}

function weeklyLines(db: DB, nowMs: number): string[] {
  const since = utcWeekStartIso(nowMs);
  const labels: Record<string, string> = { riflessi: "Riflessi", salto: "Salto", quiz: "Quiz" };
  return ["riflessi", "salto", "quiz"].map((game) => {
    const top = leaderboard(db, game, since, 3);
    if (!top.length) return `${labels[game]}: nessun punteggio.`;
    const bits = top.map((row, index) => {
      const name = row.displayName || row.username || "socio";
      return `${index + 1} ${name} ${row.score}${row.demo ? " demo" : ""}`;
    });
    return `${labels[game]}: ${bits.join(", ")}.`;
  });
}

function winnerLines(db: DB, config: Config, nowMs: number): string[] {
  const since = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT u.display_name AS name, c.asset, c.amount_atomic AS amount
       FROM claims c JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('dry_run', 'sent') AND c.updated_at >= ?
       ORDER BY c.id DESC LIMIT 8`,
    )
    .all(since) as Array<{ name: string | null; asset: string; amount: string }>;
  return rows.map((row) => {
    const decimals = tokenOf(config, row.asset === "DSN" ? "DSN" : "OV").decimals;
    return `${row.name || "socio"} ${formatAtomic(row.amount, decimals)} ${row.asset}`;
  });
}

function requireAdmin(request: FastifyRequest, config: Config): void {
  const header = request.headers["x-admin-token"];
  const token = typeof header === "string" ? header : "";
  if (!token || !safeEqual(token, config.adminToken)) {
    throw new HttpError(401, "admin", "Token amministratore non valido.");
  }
}

function bodyOf(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "corpo", "Richiesta non valida.");
  }
  return body as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, key, "Campo mancante.");
  return value.trim();
}

function modeOf(body: Record<string, unknown>): string {
  return body.mode === "prova" ? "prova" : "classifica";
}

function idParam(request: FastifyRequest): number {
  const id = Number((request.params as { id?: string }).id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "id", "Id non valido.");
  return id;
}

function idList(body: Record<string, unknown>): number[] {
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100) {
    throw new HttpError(400, "ids", "Servono da 1 a 100 id.");
  }
  if (body.ids.some((id) => typeof id !== "number" || !Number.isInteger(id))) {
    throw new HttpError(400, "ids", "Id non validi.");
  }
  return body.ids as number[];
}

function ipOf(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]!.trim();
  return request.ip;
}
