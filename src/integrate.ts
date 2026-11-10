/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { loadConfig, loadEnvFile } from "./config.js";
import { openDatabase } from "./db.js";
import { syncFunding } from "./budget.js";
import { createZQuestComposer } from "./bot.js";

/**
 * Punto di aggancio per un bot già in polling (per esempio VelvetHub).
 * Non chiama getUpdates. Imposta ZQUEST_ENV al file .env prima dell'import
 * oppure esporta le variabili nel processo.
 *
 *   import { zquestComposer } from "/opt/zquest/dist/integrate.js";
 *   bot.use(zquestComposer);
 */
loadEnvFile(process.env.ZQUEST_ENV ?? ".env");
const config = loadConfig();
const db = openDatabase(config.databasePath);
const nowIso = new Date().toISOString();
syncFunding(db, "OV", config.ov.budgetHuman, config.ov.decimals, nowIso);
syncFunding(db, "DSN", config.dsn.budgetHuman, config.dsn.decimals, nowIso);

export const zquestComposer = createZQuestComposer({ db, config });
export { config as zquestConfig };
