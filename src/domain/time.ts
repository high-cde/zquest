/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addUtcDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) throw new Error("giorno non valido");
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export function utcWeekStartIso(ms: number): string {
  const date = new Date(ms);
  const weekday = date.getUTCDay() || 7;
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (weekday - 1));
  return new Date(start).toISOString();
}
