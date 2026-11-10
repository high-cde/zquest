/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import { safeEqual } from "./auth.js";
import { BOT_COMMANDS, createBot } from "./bot.js";
import type { DB } from "./db.js";

export async function attachBot(
  app: FastifyInstance,
  config: Config,
  db: DB,
  log: (line: string) => void,
): Promise<void> {
  if (config.botMode === "off") {
    log("bot spento (BOT_MODE=off). Nessun getUpdates da questo processo.");
    return;
  }
  if (!config.botToken) {
    log("BOT_MODE diverso da off ma BOT_TOKEN assente: bot non avviato.");
    return;
  }
  const bot = createBot(config, db);
  if (config.botMode === "webhook") {
    if (!config.telegramWebhookSecret) {
      log("webhook non attivato: manca TELEGRAM_WEBHOOK_SECRET.");
      return;
    }
    app.post("/telegram/webhook", async (request, reply) => {
      const got = request.headers["x-telegram-bot-api-secret-token"];
      if (typeof got !== "string" || !safeEqual(got, config.telegramWebhookSecret)) {
        return reply.code(401).send({ ok: false });
      }
      await bot.handleUpdate(request.body as never);
      return reply.send({ ok: true });
    });
    try {
      await bot.api.setWebhook(`${config.publicBaseUrl}/telegram/webhook`, {
        secret_token: config.telegramWebhookSecret,
        drop_pending_updates: false,
      });
      await bot.api.setMyCommands(BOT_COMMANDS);
      log("webhook Telegram registrato. Questo processo non usa getUpdates.");
    } catch (error) {
      log(`webhook non registrato: ${error instanceof Error ? error.message : "errore"}`);
    }
    return;
  }
  log("ATTENZIONE: BOT_MODE=polling chiama getUpdates. Se un altro servizio usa già questo token, spegni il polling.");
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.api.setMyCommands(BOT_COMMANDS);
  } catch (error) {
    log(`comandi bot non impostati: ${error instanceof Error ? error.message : "errore"}`);
  }
  void bot.start({
    onStart: () => log("polling avviato"),
  });
}
