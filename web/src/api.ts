/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN = "zquest.token";

export function sessionToken(): string | null {
  return localStorage.getItem(TOKEN);
}

export function setSessionToken(value: string | null): void {
  if (value) localStorage.setItem(TOKEN, value);
  else localStorage.removeItem(TOKEN);
}

export function adminToken(): string | null {
  return sessionStorage.getItem("zquest.admin");
}

export function setAdminToken(value: string | null): void {
  if (value) sessionStorage.setItem("zquest.admin", value);
  else sessionStorage.removeItem("zquest.admin");
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const session = sessionToken();
  if (session) headers.authorization = `Bearer ${session}`;
  if (options.admin) {
    const admin = adminToken();
    if (admin) headers["x-admin-token"] = admin;
  }
  const response = await fetch(path, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (response.status === 401 && !options.admin) setSessionToken(null);
  if (!response.ok) throw new ApiError(data.error?.message || "Qualcosa non ha funzionato.", response.status);
  return data as T;
}

export type PublicInfo = {
  rewardsLive: boolean;
  allowDemo: boolean;
  termsVersion: string;
  privacyContact: string;
  links: { zswap: string; self: string };
  disclaimers: string[];
  checkin: Array<{ code: string; label: string; human: number; percent: number; from: number; to: number }>;
  streak: { every: number; human: number };
  games: {
    riflessi: Array<{ label: string; human: number }>;
    salto: Array<{ label: string; human: number }>;
    quiz: Array<{ label: string; human: number }>;
  };
  quests: Record<string, number>;
  ov: TokenPublic;
  dsn: TokenPublic;
};

export type TokenPublic = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  decimalsSource: string;
  program: string;
  userCap: string;
  globalCap: string;
  todaySpent: string;
  todayRemaining: string;
  budgetRemaining: string;
};

export type Me = {
  id: number;
  displayName: string;
  username: string | null;
  demo: boolean;
  streak: number;
  checkinToday: boolean;
  wallet: string | null;
  polygonWallet: string | null;
  inviteCode: string;
  locks: { riflessi: boolean; salto: boolean; quiz: boolean };
  shareUsername: boolean;
  claims: Array<{ id: number; asset: string; amount: string; status: string; reason: string; day: string; txRef: string | null }>;
};

export const STATUS: Record<string, string> = {
  queued: "in coda",
  settling: "in invio",
  dry_run: "prova, senza transazione",
  sent: "inviato",
  failed: "invio non riuscito",
  rejected: "rifiutato",
};
