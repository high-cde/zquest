/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
const BANNED: RegExp[] = [
  /spacex/i,
  /\belon\b/i,
  /\bmusk\b/i,
  /rendimento garantito/i,
  /rendimento sicuro/i,
  /guadagno sicuro/i,
  /to the moon/i,
  /\b100x\b/i,
  /moonshot/i,
  /consiglio finanziario/i,
];

export function assertSoberDraft(text: string): void {
  for (const pattern of BANNED) {
    if (pattern.test(text)) {
      throw new Error("Il testo non è adatto: niente hype, rendimenti o affiliazioni non vere.");
    }
  }
}

export function clipTweet(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function intentPostUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

export function leaderboardDraft(lines: string[]): { body: string; intentUrl: string } {
  const body = clipTweet(
    [
      "Classifica settimanale di ZQuest, giochi di abilità a ingresso libero.",
      lines.length ? lines.join(" ") : "Nessun punteggio in classifica questa settimana.",
      "Omaggi a budget fisso, senza puntate e senza rendimento promesso.",
      "quest.x-zdos.it",
    ].join(" "),
  );
  assertSoberDraft(body);
  return { body, intentUrl: intentPostUrl(body) };
}

export function winnersDraft(lines: string[]): { body: string; intentUrl: string } {
  const body = clipTweet(
    [
      "Omaggi ZQuest contabilizzati questa settimana, dopo approvazione e nei tetti pubblici.",
      lines.length ? lines.join(" ") : "Nessun omaggio contabilizzato in questi sette giorni.",
      "Valute di comunità, non un investimento.",
      "quest.x-zdos.it",
    ].join(" "),
  );
  assertSoberDraft(body);
  return { body, intentUrl: intentPostUrl(body) };
}

export function noteDraft(note: string): { body: string; intentUrl: string } {
  const body = clipTweet(`${note.trim()} ZQuest non promette guadagni. quest.x-zdos.it`);
  assertSoberDraft(body);
  return { body, intentUrl: intentPostUrl(body) };
}
