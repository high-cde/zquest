/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { existsSync, readFileSync } from "node:fs";
import { humanToAtomic } from "./domain/money.js";

export type Asset = "OV" | "DSN";
export type BotMode = "off" | "webhook" | "polling";

export type TokenConfig = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  decimalsSource: "env" | "chain";
  program: string;
  rewardsPublic: string;
  rewardsSecret: string;
  dailyUserCapHuman: number;
  dailyGlobalCapHuman: number;
  budgetHuman: number;
};

export type Config = {
  nodeEnv: string;
  host: string;
  port: number;
  databasePath: string;
  sessionSecret: string;
  adminToken: string;
  allowDemo: boolean;
  seedDemo: boolean;
  botMode: BotMode;
  botToken: string;
  telegramWebhookSecret: string;
  publicBaseUrl: string;
  siwsDomains: string[];
  siwsUri: string;
  privacyContact: string;
  termsVersion: string;
  rewardsLive: boolean;
  solanaRpc: string;
  polygonRpc: string;
  ov: TokenConfig;
  dsn: TokenConfig;
  airdrop: AirdropConfig;
};

export type AirdropTokenSeed = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amountHuman: number;
  walletCapHuman: number;
  dailyCapHuman: number;
  cooldownSec: number;
};

export type AirdropConfig = {
  paused: boolean;
  rewardsPublic: string;
  rewardsSecret: string;
  tokens: AirdropTokenSeed[];
};

const DEFAULT_AIRDROP_TOKENS = [
  "EnxZzNG8ZarHt1Tez4ipu5yUnXj8rAbyAnXttxnMpump|$DSN|xZDOS|6|5|20|200|3600",
  "2EN6Y1zM4yyt41gE2muzdJSAgRCAZiXqnmkgpbrspump|$OV|VELVET|6|1|5|50|3600",
].join(",");

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`numero non valido: ${value}`);
  return Math.floor(parsed);
}

export function loadEnvFile(file = ".env"): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const botMode = (env.BOT_MODE ?? "off").trim().toLowerCase();
  if (botMode !== "off" && botMode !== "webhook" && botMode !== "polling") {
    throw new Error("BOT_MODE deve essere off, webhook o polling");
  }
  const port = intEnv(env.PORT, 3200);
  const siwsDomain = (env.SIWS_DOMAIN ?? "quest.x-zdos.it")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST ?? "127.0.0.1",
    port,
    databasePath: env.DATABASE_PATH ?? "./data/zquest.sqlite",
    sessionSecret: env.SESSION_SECRET ?? "change-me",
    adminToken: env.ADMIN_TOKEN ?? "change-me",
    allowDemo: bool(env.ALLOW_DEMO, false),
    seedDemo: bool(env.SEED_DEMO, false),
    botMode,
    botToken: env.BOT_TOKEN?.trim() ?? "",
    telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? "https://quest.x-zdos.it").replace(/\/$/, ""),
    siwsDomains: siwsDomain,
    siwsUri: env.SIWS_URI ?? "https://quest.x-zdos.it",
    privacyContact: env.PRIVACY_CONTACT ?? "@RedVelvetOfficial_bot",
    termsVersion: env.TERMS_VERSION ?? "2026-11-07",
    rewardsLive: bool(env.REWARDS_LIVE, false),
    solanaRpc: env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    polygonRpc: env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com",
    ov: {
      symbol: "$OV",
      name: "VELVET",
      address: env.OV_MINT ?? "2EN6Y1zM4yyt41gE2muzdJSAgRCAZiXqnmkgpbrspump",
      decimals: intEnv(env.OV_DECIMALS, 6),
      decimalsSource: "env",
      program: "token-2022",
      rewardsPublic: env.OV_REWARDS_PUBKEY?.trim() ?? "",
      rewardsSecret: env.OV_REWARDS_SECRET_KEY?.trim() ?? "",
      dailyUserCapHuman: intEnv(env.OV_DAILY_USER_CAP, 500),
      dailyGlobalCapHuman: intEnv(env.OV_DAILY_GLOBAL_CAP, 10_000),
      budgetHuman: intEnv(env.OV_REWARDS_BUDGET, 100_000),
    },
    dsn: {
      symbol: "$DSN",
      name: "NETkali",
      address: env.DSN_CONTRACT ?? "0xfc90516a1f736FaC557e09D8853dB80dA192c296",
      decimals: intEnv(env.DSN_DECIMALS, 18),
      decimalsSource: "env",
      program: "erc-20",
      rewardsPublic: env.DSN_REWARDS_ADDRESS?.trim() ?? "",
      rewardsSecret: env.DSN_REWARDS_PRIVATE_KEY?.trim() ?? "",
      dailyUserCapHuman: intEnv(env.DSN_DAILY_USER_CAP, 40),
      dailyGlobalCapHuman: intEnv(env.DSN_DAILY_GLOBAL_CAP, 400),
      budgetHuman: intEnv(env.DSN_REWARDS_BUDGET, 2000),
    },
    airdrop: {
      paused: bool(env.AIRDROP_PAUSED, false),
      rewardsPublic: env.AIRDROP_REWARDS_PUBKEY?.trim() ?? "",
      rewardsSecret: env.AIRDROP_REWARDS_SECRET_KEY?.trim() ?? "",
      tokens: parseAirdropTokens(env.AIRDROP_TOKENS),
    },
  };
}

export function parseAirdropTokens(raw: string | undefined): AirdropTokenSeed[] {
  const text = raw?.trim() ? raw.trim() : DEFAULT_AIRDROP_TOKENS;
  return text.split(",").map((part) => {
    const [mint, symbol, name, decimals, amount, walletCap, dailyCap, cooldown] = part.split("|").map((item) => item.trim());
    if (!mint || !symbol || !name) throw new Error("AIRDROP_TOKENS non valido");
    return {
      mint,
      symbol,
      name,
      decimals: Number(decimals),
      amountHuman: Number(amount),
      walletCapHuman: Number(walletCap),
      dailyCapHuman: Number(dailyCap),
      cooldownSec: Number(cooldown),
    };
  }).filter((token) => {
    if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 18) {
      throw new Error("decimali airdrop non validi");
    }
    for (const value of [token.amountHuman, token.walletCapHuman, token.dailyCapHuman, token.cooldownSec]) {
      if (!Number.isInteger(value) || value < 0) throw new Error("importo airdrop non valido");
    }
    return true;
  });
}

export function assertRuntimeConfig(config: Config): void {
  const placeholder = new Set(["", "change-me", "changeme"]);
  if (config.nodeEnv === "production") {
    if (placeholder.has(config.sessionSecret) || placeholder.has(config.adminToken)) {
      throw new Error("In produzione SESSION_SECRET e ADMIN_TOKEN vanno cambiati.");
    }
    if (config.sessionSecret.length < 24 || config.adminToken.length < 16) {
      throw new Error("SESSION_SECRET o ADMIN_TOKEN troppo corti.");
    }
  }
  if (config.rewardsLive) {
    if (!config.ov.rewardsSecret || !config.dsn.rewardsSecret) {
      throw new Error("REWARDS_LIVE=true richiede le chiavi dei due portafogli premi.");
    }
    if (config.ov.budgetHuman <= 0 || config.dsn.budgetHuman <= 0) {
      throw new Error("REWARDS_LIVE=true richiede un budget maggiore di zero.");
    }
  }
}

export function capAtomic(token: TokenConfig, scope: "user" | "global"): bigint {
  const human = scope === "user" ? token.dailyUserCapHuman : token.dailyGlobalCapHuman;
  return humanToAtomic(human, token.decimals);
}

export function tokenOf(config: Config, asset: Asset): TokenConfig {
  return asset === "OV" ? config.ov : config.dsn;
}
