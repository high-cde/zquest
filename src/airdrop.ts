/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import { humanToAtomic, formatAtomic } from "./domain/money.js";
import { utcDay } from "./domain/time.js";
import { HttpError, isUniqueError } from "./errors.js";
import { sendSpl } from "./payout-solana.js";
import { getUser, withTx, type DB, type User } from "./db.js";

export const XZDOS_MINT = "EnxZzNG8ZarHt1Tez4ipu5yUnXj8rAbyAnXttxnMpump";
export const OV_MINT = "2EN6Y1zM4yyt41gE2muzdJSAgRCAZiXqnmkgpbrspump";

type TokenRow = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  program: string;
  amount_human: number;
  wallet_cap_human: number;
  daily_cap_human: number;
  cooldown_sec: number;
  paused: number;
};

type MissionRow = {
  code: string;
  title: string;
  detail: string;
  kind: string;
  mint: string;
  amount_human: number;
  optional: number;
  enabled: number;
};

type ClaimRow = {
  id: number;
  mission: string;
  mint: string;
  amount_atomic: string;
  status: string;
  tx_ref: string | null;
  created_at: string;
  day: string;
};

export type AirdropSender = (input: {
  mint: string;
  program: "token" | "token-2022";
  decimals: number;
  amountAtomic: string;
  destination: string;
}) => Promise<string>;

const MISSIONS = [
  {
    code: "regole",
    title: "Leggi le regole",
    detail: "Confermi di aver letto che l'omaggio è fisso, gratuito e senza rendimento promesso.",
    kind: "ack",
    mint: XZDOS_MINT,
    amountHuman: 5,
    optional: 0,
  },
  {
    code: "checkin",
    title: "Check-in",
    detail: "Almeno un check-in registrato su ZQuest.",
    kind: "checkin",
    mint: OV_MINT,
    amountHuman: 1,
    optional: 0,
  },
  {
    code: "gioco",
    title: "Una manche in classifica",
    detail: "Una manche conclusa in classifica, non in prova.",
    kind: "game",
    mint: XZDOS_MINT,
    amountHuman: 5,
    optional: 0,
  },
  {
    code: "telegram",
    title: "Telegram collegato",
    detail: "Facoltativo. Vale se il profilo arriva da Telegram, non dalla dimostrazione.",
    kind: "telegram",
    mint: OV_MINT,
    amountHuman: 1,
    optional: 1,
  },
] as const;

export function seedAirdrop(db: DB, config: Config): void {
  const insertToken = db.prepare(
    `INSERT INTO airdrop_tokens (
      mint, symbol, name, decimals, program, amount_human, wallet_cap_human, daily_cap_human, cooldown_sec, paused
    ) VALUES (?, ?, ?, ?, 'token-2022', ?, ?, ?, ?, 0)
    ON CONFLICT(mint) DO NOTHING`,
  );
  for (const token of config.airdrop.tokens) {
    insertToken.run(
      token.mint,
      token.symbol,
      token.name,
      token.decimals,
      token.amountHuman,
      token.walletCapHuman,
      token.dailyCapHuman,
      token.cooldownSec,
    );
  }
  const insertMission = db.prepare(
    `INSERT INTO airdrop_missions (code, title, detail, kind, mint, amount_human, optional, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(code) DO NOTHING`,
  );
  for (const mission of MISSIONS) {
    const known = db.prepare("SELECT mint FROM airdrop_tokens WHERE mint = ?").get(mission.mint);
    if (!known) continue;
    insertMission.run(mission.code, mission.title, mission.detail, mission.kind, mission.mint, mission.amountHuman, mission.optional);
  }
  db.prepare("INSERT INTO meta (key, value) VALUES ('airdrop_paused', ?) ON CONFLICT(key) DO NOTHING").run(
    config.airdrop.paused ? "1" : "0",
  );
}

export function applyMintChain(
  db: DB,
  mint: string,
  info: { decimals: number; program: "token" | "token-2022"; symbol: string | null; name: string | null },
): void {
  db.prepare(
    `UPDATE airdrop_tokens
     SET decimals = ?, program = ?,
         symbol = CASE WHEN ? IS NULL OR ? = '' THEN symbol ELSE ? END,
         name = CASE WHEN ? IS NULL OR ? = '' THEN name ELSE ? END
     WHERE mint = ?`,
  ).run(info.decimals, info.program, info.symbol, info.symbol, info.symbol, info.name, info.name, info.name, mint);
}

export function acknowledgeRules(db: DB, userId: number, nowIso: string): void {
  db.prepare("INSERT INTO airdrop_acks (user_id, created_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING").run(
    userId,
    nowIso,
  );
}

export function airdropView(db: DB, user: User | null) {
  const paused = globalPaused(db);
  const tokens = db.prepare("SELECT * FROM airdrop_tokens ORDER BY symbol").all() as TokenRow[];
  const missions = db.prepare("SELECT * FROM airdrop_missions WHERE enabled = 1 ORDER BY code").all() as MissionRow[];
  const claims = user?.wallet
    ? (db.prepare(
        "SELECT mission, mint, amount_atomic, status, tx_ref, created_at, day FROM airdrop_claims WHERE wallet = ? ORDER BY id DESC",
      ).all(user.wallet) as ClaimRow[])
    : [];
  const claimed = new Set(claims.filter((claim) => claim.status !== "failed").map((claim) => claim.mission));
  return {
    paused,
    wallet: user?.wallet ?? null,
    telegramLinked: Boolean(user && /^\d+$/.test(user.telegram_id)),
    progress: {
      done: missions.filter((mission) => claimed.has(mission.code)).length,
      total: missions.length,
    },
    tokens: tokens.map((token) => ({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      program: token.program,
      walletCap: token.wallet_cap_human,
      dailyCap: token.daily_cap_human,
      cooldownSec: token.cooldown_sec,
      paused: token.paused === 1,
      note: token.mint === XZDOS_MINT ? "Gettone Solana. Non è il $DSN NETkali su Polygon." : "Gettone Solana VELVET.",
    })),
    missions: missions.map((mission) => {
      const token = tokens.find((item) => item.mint === mission.mint);
      return {
        code: mission.code,
        title: mission.title,
        detail: mission.detail,
        optional: mission.optional === 1,
        symbol: token?.symbol ?? "",
        name: token?.name ?? "",
        amount: mission.amount_human,
        ready: Boolean(user && missionVerified(db, user, mission.kind)),
        claimed: claimed.has(mission.code),
      };
    }),
    history: claims.map((claim) => {
      const token = tokens.find((item) => item.mint === claim.mint);
      return {
        mission: claim.mission,
        symbol: token?.symbol ?? "",
        amount: token ? formatAtomic(claim.amount_atomic, token.decimals) : claim.amount_atomic,
        status: claim.status,
        txRef: claim.tx_ref,
        createdAt: claim.created_at,
        day: claim.day,
      };
    }),
  };
}

export async function claimMission(
  db: DB,
  config: Config,
  user: User,
  code: string,
  nowMs: number,
  ip: string,
  sender: AirdropSender,
): Promise<{ status: string; amount: string; symbol: string; detail: string }> {
  if (!user.wallet) {
    throw new HttpError(403, "portafoglio", "Collega Phantom con una firma prima di riscuotere. Non è una transazione.");
  }
  const prepared = withTx(db, () => prepareClaim(db, user, code, nowMs, ip));
  if (prepared.status === "dry_run") {
    return { status: "dry_run", amount: prepared.amount, symbol: prepared.symbol, detail: "Registrato in prova. Nessuna transazione." };
  }
  try {
    const signature = await sender({
      mint: prepared.mint,
      program: prepared.program,
      decimals: prepared.decimals,
      amountAtomic: prepared.amountAtomic,
      destination: user.wallet,
    });
    db.prepare("UPDATE airdrop_claims SET status = 'sent', tx_ref = ?, detail = NULL WHERE id = ? AND status = 'settling'").run(
      signature,
      prepared.id,
    );
    return { status: "sent", amount: prepared.amount, symbol: prepared.symbol, detail: "Inviato dal portafoglio airdrop." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invio non riuscito";
    db.prepare("UPDATE airdrop_claims SET status = 'failed', detail = ? WHERE id = ? AND status = 'settling'").run(
      message.slice(0, 180),
      prepared.id,
    );
    throw new HttpError(502, "invio", "Invio non riuscito. La missione si può riprovare. Nessun fondo è stato segnato come inviato.");
  }
}

function prepareClaim(db: DB, user: User, code: string, nowMs: number, ip: string) {
  if (globalPaused(db)) throw new HttpError(423, "pausa", "L'airdrop è in pausa.");
  const mission = db.prepare("SELECT * FROM airdrop_missions WHERE code = ? AND enabled = 1").get(code) as MissionRow | undefined;
  if (!mission) throw new HttpError(404, "missione", "Missione sconosciuta.");
  if (!missionVerified(db, user, mission.kind)) {
    throw new HttpError(409, "missione", "Missione non ancora completata.");
  }
  const token = db.prepare("SELECT * FROM airdrop_tokens WHERE mint = ?").get(mission.mint) as TokenRow | undefined;
  if (!token) throw new HttpError(404, "token", "Gettone non in elenco.");
  if (token.paused) throw new HttpError(423, "pausa", "Questo gettone è in pausa.");
  const wallet = user.wallet!;
  const existing = db
    .prepare(
      "SELECT id FROM airdrop_claims WHERE wallet = ? AND mission = ? AND status IN ('settling','dry_run','sent')",
    )
    .get(wallet, code);
  if (existing) throw new HttpError(409, "gia", "Questa missione è già stata riscattata da questo portafoglio.");
  const last = db
    .prepare(
      `SELECT created_at FROM airdrop_claims
       WHERE wallet = ? AND mint = ? AND status IN ('settling','dry_run','sent')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(wallet, token.mint) as { created_at: string } | undefined;
  if (last) {
    const elapsed = nowMs - Date.parse(last.created_at);
    if (elapsed < token.cooldown_sec * 1000) {
      throw new HttpError(429, "attesa", "Aspetta prima di un altro riscatto di questo gettone.");
    }
  }
  const amountAtomic = humanToAtomic(mission.amount_human, token.decimals);
  const walletSpent = spent(db, { mint: token.mint, wallet });
  const walletCap = humanToAtomic(token.wallet_cap_human, token.decimals);
  if (walletSpent + amountAtomic > walletCap) {
    throw new HttpError(409, "cap_utente", "Tetto del portafoglio raggiunto per questo gettone.");
  }
  const day = utcDay(nowMs);
  const daySpent = spent(db, { mint: token.mint, day });
  const dayCap = humanToAtomic(token.daily_cap_human, token.decimals);
  if (daySpent + amountAtomic > dayCap) {
    throw new HttpError(409, "cap_globale", "Tetto di comunità di oggi raggiunto per questo gettone.");
  }
  const live = rewardsLive(db);
  const nowIso = new Date(nowMs).toISOString();
  try {
    const inserted = db
      .prepare(
        `INSERT INTO airdrop_claims (
          user_id, wallet, mission, mint, amount_atomic, day, status, ip, telegram_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        wallet,
        code,
        token.mint,
        amountAtomic.toString(),
        day,
        live ? "settling" : "dry_run",
        ip,
        /^\d+$/.test(user.telegram_id) ? user.telegram_id : null,
        nowIso,
      );
    return {
      id: Number(inserted.lastInsertRowid),
      status: live ? "settling" : "dry_run",
      mint: token.mint,
      program: token.program === "token" ? "token" as const : "token-2022" as const,
      decimals: token.decimals,
      amountAtomic: amountAtomic.toString(),
      amount: formatAtomic(amountAtomic, token.decimals),
      symbol: token.symbol,
    };
  } catch (error) {
    if (isUniqueError(error)) throw new HttpError(409, "gia", "Questa missione è già stata riscattata da questo portafoglio.");
    throw error;
  }
}

function rewardsLive(db: DB): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'rewards_live'").get() as { value: string } | undefined;
  return row?.value === "1";
}

export function syncRewardsLiveFlag(db: DB, live: boolean): void {
  db.prepare("INSERT INTO meta (key, value) VALUES ('rewards_live', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    live ? "1" : "0",
  );
}

function globalPaused(db: DB): boolean {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'airdrop_paused'").get() as { value: string } | undefined;
  return row?.value === "1";
}

function missionVerified(db: DB, user: User | null, kind: string): boolean {
  if (!user) return false;
  if (kind === "ack") {
    return Boolean(db.prepare("SELECT 1 AS ok FROM airdrop_acks WHERE user_id = ?").get(user.id));
  }
  if (kind === "checkin") {
    return Boolean(db.prepare("SELECT 1 AS ok FROM checkins WHERE user_id = ?").get(user.id));
  }
  if (kind === "game") {
    return Boolean(
      db.prepare("SELECT 1 AS ok FROM game_runs WHERE user_id = ? AND mode = 'classifica' AND state = 'done'").get(user.id),
    );
  }
  if (kind === "telegram") return /^\d+$/.test(user.telegram_id);
  return false;
}

function spent(db: DB, filter: { mint: string; wallet?: string; day?: string }): bigint {
  const where = ["mint = ?", "status IN ('settling','dry_run','sent')"];
  const params: string[] = [filter.mint];
  if (filter.wallet) {
    where.push("wallet = ?");
    params.push(filter.wallet);
  }
  if (filter.day) {
    where.push("day = ?");
    params.push(filter.day);
  }
  const rows = db.prepare(`SELECT amount_atomic FROM airdrop_claims WHERE ${where.join(" AND ")}`).all(...params) as Array<{
    amount_atomic: string;
  }>;
  return rows.reduce((sum, row) => sum + BigInt(row.amount_atomic), 0n);
}

export function setGlobalPause(db: DB, paused: boolean): void {
  db.prepare("INSERT INTO meta (key, value) VALUES ('airdrop_paused', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    paused ? "1" : "0",
  );
}

export function updateAirdropToken(
  db: DB,
  input: { mint: string; amountHuman?: number; walletCapHuman?: number; dailyCapHuman?: number; cooldownSec?: number; paused?: boolean },
): void {
  const current = db.prepare("SELECT mint FROM airdrop_tokens WHERE mint = ?").get(input.mint);
  if (!current) throw new HttpError(404, "token", "Gettone non in elenco.");
  if (input.walletCapHuman !== undefined) {
    db.prepare("UPDATE airdrop_tokens SET wallet_cap_human = ? WHERE mint = ?").run(input.walletCapHuman, input.mint);
  }
  if (input.dailyCapHuman !== undefined) {
    db.prepare("UPDATE airdrop_tokens SET daily_cap_human = ? WHERE mint = ?").run(input.dailyCapHuman, input.mint);
  }
  if (input.cooldownSec !== undefined) {
    db.prepare("UPDATE airdrop_tokens SET cooldown_sec = ? WHERE mint = ?").run(input.cooldownSec, input.mint);
  }
  if (input.paused !== undefined) {
    db.prepare("UPDATE airdrop_tokens SET paused = ? WHERE mint = ?").run(input.paused ? 1 : 0, input.mint);
  }
  if (input.amountHuman !== undefined) {
    db.prepare("UPDATE airdrop_missions SET amount_human = ? WHERE mint = ?").run(input.amountHuman, input.mint);
  }
}

export function updateMission(db: DB, input: { code: string; amountHuman?: number; enabled?: boolean }): void {
  const current = db.prepare("SELECT code FROM airdrop_missions WHERE code = ?").get(input.code);
  if (!current) throw new HttpError(404, "missione", "Missione sconosciuta.");
  if (input.amountHuman !== undefined) {
    db.prepare("UPDATE airdrop_missions SET amount_human = ? WHERE code = ?").run(input.amountHuman, input.code);
  }
  if (input.enabled !== undefined) {
    db.prepare("UPDATE airdrop_missions SET enabled = ? WHERE code = ?").run(input.enabled ? 1 : 0, input.code);
  }
}

export function adminAirdropView(db: DB) {
  return {
    paused: globalPaused(db),
    tokens: db.prepare("SELECT * FROM airdrop_tokens").all(),
    missions: db.prepare("SELECT * FROM airdrop_missions").all(),
    claims: (db.prepare("SELECT COUNT(*) AS n FROM airdrop_claims WHERE status = 'dry_run'").get() as { n: number }).n,
  };
}

export function registerAirdropRoutes(
  app: FastifyInstance,
  deps: {
    db: DB;
    config: Config;
    now: () => number;
    sender?: AirdropSender;
    authUser: (request: FastifyRequest) => User;
    guard: (key: string, limit: number, windowMs: number) => void;
    ipOf: (request: FastifyRequest) => string;
    requireAdmin: (request: FastifyRequest) => void;
  },
): void {
  const sender = deps.sender ?? ((input) => sendSpl(deps.config, input));

  app.get("/api/airdrop", async (request) => {
    const header = request.headers.authorization;
    let user: User | null = null;
    if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
      try {
        user = deps.authUser(request);
      } catch {
        user = null;
      }
    }
    return {
      rewardsLive: deps.config.rewardsLive,
      disclaimer: "Omaggio fisso di comunità. Non è un guadagno e non promette un valore futuro. Con gli invii in prova non parte alcuna transazione.",
      ...airdropView(deps.db, user),
    };
  });

  app.post("/api/airdrop/regole", async (request) => {
    const user = deps.authUser(request);
    acknowledgeRules(deps.db, user.id, new Date(deps.now()).toISOString());
    return { ok: true };
  });

  app.post("/api/airdrop/riscuoti", async (request) => {
    const user = deps.authUser(request);
    deps.guard(`airdrop:${deps.ipOf(request)}`, 10, 60 * 60 * 1000);
    const body = request.body as { code?: unknown };
    if (!body || typeof body !== "object" || typeof body.code !== "string" || !body.code.trim()) {
      throw new HttpError(400, "missione", "Missione mancante.");
    }
    return claimMission(deps.db, deps.config, freshUser(deps.db, user.id), body.code.trim(), deps.now(), deps.ipOf(request), sender);
  });

  app.get("/api/admin/airdrop", async (request) => {
    deps.requireAdmin(request);
    return adminAirdropView(deps.db);
  });

  app.post("/api/admin/airdrop/pausa", async (request) => {
    deps.requireAdmin(request);
    const paused = (request.body as { paused?: unknown })?.paused === true;
    setGlobalPause(deps.db, paused);
    return { paused };
  });

  app.post("/api/admin/airdrop/token", async (request) => {
    deps.requireAdmin(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.mint !== "string") throw new HttpError(400, "token", "Mint mancante.");
    updateAirdropToken(deps.db, {
      mint: body.mint,
      amountHuman: optionalInt(body.amountHuman),
      walletCapHuman: optionalInt(body.walletCapHuman),
      dailyCapHuman: optionalInt(body.dailyCapHuman),
      cooldownSec: optionalInt(body.cooldownSec),
      paused: typeof body.paused === "boolean" ? body.paused : undefined,
    });
    return { ok: true };
  });

  app.post("/api/admin/airdrop/missione", async (request) => {
    deps.requireAdmin(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.code !== "string") throw new HttpError(400, "missione", "Codice mancante.");
    updateMission(deps.db, {
      code: body.code,
      amountHuman: optionalInt(body.amountHuman),
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    });
    return { ok: true };
  });
}

function optionalInt(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, "numero", "Numero non valido.");
  }
  return value;
}

export function freshUser(db: DB, id: number): User {
  const user = getUser(db, id);
  if (!user) throw new HttpError(401, "sessione", "Sessione non valida.");
  return user;
}
