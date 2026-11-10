/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export function humanToAtomic(human: number, decimals: number): bigint {
  if (!Number.isSafeInteger(human) || human < 0) {
    throw new Error("importo non valido");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("decimali non validi");
  }
  return BigInt(human) * 10n ** BigInt(decimals);
}

export function formatAtomic(amount: string | bigint, decimals: number): string {
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac ? `${whole},${frac}` : whole;
  return negative ? `-${body}` : body;
}

export function shortAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
