/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { Bot, Composer, type Context } from "grammy";
import { randomInt } from "node:crypto";
import type { Config } from "./config.js";
import { formatAtomic } from "./domain/money.js";
import { describePrize } from "./domain/prizes.js";
import { performCheckin } from "./checkin.js";
import type { DB } from "./db.js";
import { leaderboard } from "./games.js";
import { listQuests } from "./quests.js";
import { utcWeekStartIso } from "./domain/time.js";
import { anonymizeAccount, displayOf, eraseDating, upsertTelegramUser } from "./users.js";

export const BOT_COMMANDS = [
  { command: "start", description: "Presentazione di ZQuest" },
  { command: "checkin", description: "Check-in gratuito del giorno" },
  { command: "giochi", description: "Giochi di abilità" },
  { command: "quest", description: "Quest $DSN" },
  { command: "classifica", description: "Classifica della settimana" },
  { command: "profilo", description: "Il tuo stato" },
  { command: "incontri", description: "Incontri 18+ in beta" },
  { command: "cancella", description: "Cancella dati personali" },
  { command: "aiuto", description: "Regole in breve" },
];

const HELP = [
  "ZQuest è gratuito: niente puntate, niente pagamento per giocare.",
  "$OV e $DSN sono valute di comunità, senza rendimento promesso.",
  "Check-in una volta al giorno UTC. La tabella probabilità è sul sito.",
  "I premi entrano in coda. L'invio on-chain richiede approvazione e REWARDS_LIVE.",
  "Gli incontri sono un servizio 18+ separato, in beta, senza gettoni.",
  "Comandi: /checkin /giochi /quest /classifica /profilo /incontri /cancella /aiuto",
].join("\n");

export function createZQuestComposer(deps: { db: DB; config: Config }): Composer<Context> {
  const { db, config } = deps;
  const composer = new Composer<Context>();

  const person = (ctx: Context) => {
    if (!ctx.from) return null;
    return upsertTelegramUser(
      db,
      { id: ctx.from.id, username: ctx.from.username },
      new Date().toISOString(),
    );
  };

  composer.command("start", async (ctx) => {
    person(ctx);
    await ctx.reply(
      `ZQuest, omaggi e giochi di abilità per ZDOS e Red Velvet.\n${HELP}\n\nMini-app: ${config.publicBaseUrl}`,
    );
  });

  composer.command("aiuto", async (ctx) => {
    await ctx.reply(HELP);
  });

  composer.command("checkin", async (ctx) => {
    const user = person(ctx);
    if (!user) return;
    if (user.banned) {
      await ctx.reply("Profilo sospeso.");
      return;
    }
    const result = performCheckin(db, config, user.id, Date.now(), () => randomInt(0, 10_000));
    if (result.already) {
      await ctx.reply(`Check-in di oggi già registrato. Serie: ${result.streak} giorni.`);
      return;
    }
    const amount = formatAtomic(result.amountAtomic, config.ov.decimals);
    const lines = [
      `Estrazione ${result.roll} su 10000.`,
      `Esito tabella: ${describePrize(result.prizeCode)}.`,
      `In coda: ${amount} $OV${result.limit ? ` (${describePrize(result.limit)})` : ""}.`,
      `Serie: ${result.streak} giorni.`,
    ];
    if (result.streakBonusAtomic !== "0") {
      lines.push(`Bonus serie: ${formatAtomic(result.streakBonusAtomic, config.ov.decimals)} $OV.`);
    }
    lines.push("Nessun invio parte da solo. Senza REWARDS_LIVE resta una prova, dopo approvazione.");
    await ctx.reply(lines.join("\n"));
  });

  composer.command("giochi", async (ctx) => {
    await ctx.reply(
      `Riflessi, salto di Zillo e quiz ZLang si giocano nella mini-app.\n${config.publicBaseUrl}/#/giochi\nLa prima manche in classifica del giorno può mettere un omaggio in coda. Le prove no.`,
    );
  });

  composer.command("quest", async (ctx) => {
    const user = person(ctx);
    if (!user) return;
    const quests = listQuests(db, user);
    const lines = quests.items.map((item) => `${item.title}: ${item.status} (${item.human} $DSN)`);
    lines.push(`Inviti premiati: ${quests.inviteRewards}/${quests.inviteMax}. Codice: ${quests.inviteCode}`);
    lines.push("Nessuna quest per like, repost o follow.");
    await ctx.reply(lines.join("\n"));
  });

  composer.command("classifica", async (ctx) => {
    const since = utcWeekStartIso(Date.now());
    const top = leaderboard(db, "salto", since, 5);
    if (!top.length) {
      await ctx.reply("Nessun salto in classifica questa settimana.");
      return;
    }
    const lines = top.map(
      (row, index) =>
        `${index + 1}. ${row.displayName || row.username || "socio"} — ${row.score}${row.demo ? " (demo)" : ""}`,
    );
    await ctx.reply(`Salto di Zillo, settimana in corso:\n${lines.join("\n")}`);
  });

  composer.command("profilo", async (ctx) => {
    const user = person(ctx);
    if (!user) return;
    await ctx.reply(
      [
        displayOf(user),
        `Serie check-in: ${user.streak}`,
        `Solana: ${user.wallet ? "collegato" : "non collegato"}`,
        `Polygon: ${user.polygon_wallet ? "collegato" : "non collegato"}`,
        `Codice invito: ${user.invite_code}`,
      ].join("\n"),
    );
  });

  composer.command("incontri", async (ctx) => {
    const user = person(ctx);
    if (!user) return;
    await ctx.reply(
      [
        "Incontri 18+ in beta, separati dai premi: niente gettoni, niente pagamenti.",
        "L'età è un'autodichiarazione, non una verifica del documento.",
        user.age_gate === "declared"
          ? "Hai già fatto l'autodichiarazione. Il resto è nella mini-app, senza contenuti espliciti."
          : "Apri la mini-app per l'autodichiarazione e l'eventuale profilo.",
        config.publicBaseUrl + "/#/incontri",
      ].join("\n"),
    );
  });

  composer.command("cancella", async (ctx) => {
    const user = person(ctx);
    if (!user) return;
    const arg = typeof ctx.match === "string" ? ctx.match.trim().toUpperCase() : "";
    if (arg === "DATI") {
      eraseDating(db, user.id);
      await ctx.reply("Dati degli incontri cancellati. Il registro contabile dei premi, senza testi del profilo, resta.");
      return;
    }
    if (arg === "ACCOUNT CONFERMO") {
      anonymizeAccount(db, user.id, new Date().toISOString());
      await ctx.reply("Account anonimizzato. I movimenti di budget restano su un id interno, senza nome né indirizzi.");
      return;
    }
    await ctx.reply(
      "Cancellazione GDPR.\n/cancella DATI elimina il profilo incontri, like, match e blocchi.\n/cancella ACCOUNT CONFERMO anonimizza anche nome, username e portafogli.\nL'esito «sotto i 18», se c'è, resta come blocco tecnico.",
    );
  });

  return composer;
}

export function createBot(config: Config, db: DB): Bot<Context> {
  if (!config.botToken) throw new Error("BOT_TOKEN assente");
  const bot = new Bot(config.botToken);
  bot.use(createZQuestComposer({ db, config }));
  bot.catch((error) => {
    console.error("bot:", error.error instanceof Error ? error.error.message : "errore");
  });
  return bot;
}
