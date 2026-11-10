/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { attachBot } from "./boot.js";
import { assertRuntimeConfig, loadConfig, loadEnvFile } from "./config.js";
import { refreshDecimals } from "./chain.js";
import { openDatabase } from "./db.js";
import { buildApp } from "./app.js";
import { seedDemo } from "./seed.js";
import { dsnPublicFromSecret } from "./payout-polygon.js";
import { ovPublicFromSecret } from "./payout-solana.js";

loadEnvFile(process.env.ZQUEST_ENV ?? ".env");
const config = loadConfig();
assertRuntimeConfig(config);

const log = (line: string) => console.log(`[zquest] ${line}`);

await refreshDecimals(config, log);
if (config.ov.rewardsSecret) {
  try {
    log(`portafoglio premi $OV ${ovPublicFromSecret(config.ov.rewardsSecret)}`);
  } catch {
    log("chiave $OV presente ma non valida");
    if (config.rewardsLive) process.exit(1);
  }
} else {
  log("portafoglio premi $OV non configurato");
}
if (config.dsn.rewardsSecret) {
  try {
    log(`portafoglio premi $DSN ${dsnPublicFromSecret(config.dsn.rewardsSecret)}`);
  } catch {
    log("chiave $DSN presente ma non valida");
    if (config.rewardsLive) process.exit(1);
  }
} else {
  log("portafoglio premi $DSN non configurato");
}
log(config.rewardsLive ? "REWARDS_LIVE attivo: gli invii partono solo dopo approvazione" : "premi in prova: nessuna transazione");

const db = openDatabase(config.databasePath);
if (config.seedDemo) seedDemo(db, Date.now());
const app = await buildApp({ config, db, logger: config.nodeEnv !== "test" });
await attachBot(app, config, db, log);
await app.listen({ host: config.host, port: config.port });
log(`in ascolto su http://${config.host}:${config.port}`);
