/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { syncFunding } from "../src/budget.js";
import { loadConfig, type Config } from "../src/config.js";
import { openDatabase, type DB } from "../src/db.js";
import { createDemoUser } from "../src/users.js";

export function testConfig(
  over: {
    rewardsLive?: boolean;
    allowDemo?: boolean;
    ov?: Partial<Config["ov"]>;
    dsn?: Partial<Config["dsn"]>;
  } = {},
): Config {
  const config = loadConfig({
    NODE_ENV: "test",
    SESSION_SECRET: "test-session-secret-value-123456",
    ADMIN_TOKEN: "test-admin-token-123456",
    ALLOW_DEMO: over.allowDemo === false ? "false" : "true",
    OV_REWARDS_BUDGET: "100000",
    DSN_REWARDS_BUDGET: "2000",
    OV_DAILY_USER_CAP: "500",
    OV_DAILY_GLOBAL_CAP: "10000",
    DSN_DAILY_USER_CAP: "40",
    DSN_DAILY_GLOBAL_CAP: "400",
    REWARDS_LIVE: "false",
    BOT_MODE: "off",
    SIWS_DOMAIN: "quest.x-zdos.it",
    SIWS_URI: "https://quest.x-zdos.it",
    DATABASE_PATH: ":memory:",
  });
  config.rewardsLive = over.rewardsLive ?? false;
  config.ov = { ...config.ov, ...over.ov };
  config.dsn = { ...config.dsn, ...over.dsn };
  return config;
}

export function testDb(config = testConfig()): { db: DB; config: Config } {
  const db = openDatabase(":memory:");
  const now = new Date().toISOString();
  syncFunding(db, "OV", config.ov.budgetHuman, config.ov.decimals, now);
  syncFunding(db, "DSN", config.dsn.budgetHuman, config.dsn.decimals, now);
  return { db, config };
}

export function makeUser(db: DB, name = "Prova") {
  return createDemoUser(db, name, new Date().toISOString());
}
