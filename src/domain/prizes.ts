/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export type PrizeCode = "secco" | "scintilla" | "mattone" | "stella" | "zecca";

export type Prize = {
  code: PrizeCode;
  label: string;
  bps: number;
  human: number;
};

/** Tabella pubblica del check-in. I bps sommano a 10.000 (100%). */
export const CHECKIN_TABLE: readonly Prize[] = [
  { code: "secco", label: "Nessun omaggio", bps: 6000, human: 0 },
  { code: "scintilla", label: "Scintilla", bps: 2500, human: 5 },
  { code: "mattone", label: "Mattone", bps: 1000, human: 20 },
  { code: "stella", label: "Stella", bps: 400, human: 80 },
  { code: "zecca", label: "Zecca d'oro", bps: 100, human: 200 },
] as const;

const TOTAL_BPS = CHECKIN_TABLE.reduce((sum, prize) => sum + prize.bps, 0);
if (TOTAL_BPS !== 10_000) {
  throw new Error(`tabella premi non chiude a 10000 (è ${TOTAL_BPS})`);
}

export const STREAK_EVERY_DAYS = 7;
export const STREAK_BONUS_HUMAN = 10;

export const DSN_QUEST_HUMAN = {
  guida: 2,
  giochi: 3,
  zswap: 1,
  github: 10,
  invito: 2,
} as const;

export const MAX_INVITE_REWARDS = 5;

export type LimitReason = "cap_utente" | "cap_globale" | "budget";

export function prizeForRoll(roll: number): Prize {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10_000) {
    throw new Error("estrazione fuori scala");
  }
  let cursor = 0;
  for (const prize of CHECKIN_TABLE) {
    cursor += prize.bps;
    if (roll < cursor) return prize;
  }
  return CHECKIN_TABLE[CHECKIN_TABLE.length - 1]!;
}

export function reflexReward(ms: number, blocked: boolean): number {
  if (blocked || ms < 80 || ms > 450) return 0;
  if (ms <= 220) return 12;
  if (ms <= 320) return 6;
  return 2;
}

export function saltoReward(score: number): number {
  if (score >= 40) return 15;
  if (score >= 20) return 8;
  if (score >= 8) return 3;
  return 0;
}

export function quizReward(score: number): number {
  if (score >= 5) return 12;
  if (score >= 4) return 8;
  if (score >= 3) return 4;
  return 0;
}

export const PRIZE_LABEL: Record<string, string> = {
  secco: "Nessun omaggio",
  scintilla: "Scintilla",
  mattone: "Mattone",
  stella: "Stella",
  zecca: "Zecca d'oro",
  cap_utente: "Tetto personale del giorno già raggiunto",
  cap_globale: "Tetto di comunità del giorno già raggiunto",
  budget: "Budget omaggi esaurito",
};

export function describePrize(code: string): string {
  return PRIZE_LABEL[code] ?? code;
}
