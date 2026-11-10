/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import type { Config } from "./config.js";
import { HttpError } from "./errors.js";
import { getUser, withTx, type DB, type User } from "./db.js";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const NONCE_MS = 10 * 60 * 1000;

export function signSession(secret: string, userId: number, nowMs: number): string {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: nowMs + SESSION_MS })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readSession(secret: string, token: string | undefined, nowMs: number): number | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { uid?: number; exp?: number };
    if (!payload.uid || !payload.exp || payload.exp < nowMs) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifySolanaSignature(message: string, signature: Uint8Array, publicKey: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), signature, publicKey);
}

export function isSolanaAddress(value: string): boolean {
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

export function buildSiwsMessage(input: {
  domain: string;
  address: string;
  uri: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.address,
    "",
    "Collego questo portafoglio Solana al mio profilo ZQuest. Non è una transazione e non muove fondi.",
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
  ].join("\n");
}

function storeNonce(
  db: DB,
  userId: number,
  purpose: string,
  message: string,
  address: string,
  nowMs: number,
): string {
  const nonce = randomBytes(16).toString("base64url");
  db.prepare(
    `INSERT INTO nonces (nonce, user_id, purpose, message, address, expires_at, used)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  ).run(nonce, userId, purpose, message, address, nowMs + NONCE_MS);
  return nonce;
}

export function prepareSiws(
  db: DB,
  config: Config,
  userId: number,
  address: string,
  nowMs: number,
  request: { domain: string; uri: string },
): { message: string; nonce: string } {
  if (!isSolanaAddress(address)) throw new HttpError(400, "indirizzo", "Indirizzo Solana non valido.");
  if (!config.siwsDomains.includes(request.domain) || !uriMatches(request.uri, request.domain)) {
    throw new HttpError(400, "dominio", "Dominio non accettato per la firma.");
  }
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = new Date(nowMs).toISOString();
  const message = buildSiwsMessage({
    domain: request.domain,
    address,
    uri: request.uri,
    nonce,
    issuedAt,
  });
  db.prepare(
    `INSERT INTO nonces (nonce, user_id, purpose, message, address, expires_at, used)
     VALUES (?, ?, 'siws', ?, ?, ?, 0)`,
  ).run(nonce, userId, message, address, nowMs + NONCE_MS);
  return { message, nonce };
}

export function confirmSiws(
  db: DB,
  userId: number,
  message: string,
  signatureBase58: string,
  nowMs: number,
): { wallet: string } {
  const row = db
    .prepare("SELECT * FROM nonces WHERE message = ? AND user_id = ? AND purpose = 'siws'")
    .get(message, userId) as
    | { nonce: string; address: string; expires_at: number; used: number }
    | undefined;
  if (!row || row.used || row.expires_at < nowMs) {
    throw new HttpError(400, "nonce", "Messaggio scaduto o già usato. Chiedine uno nuovo.");
  }
  if (!message.includes(`Nonce: ${row.nonce}`) || !message.includes(row.address)) {
    throw new HttpError(400, "messaggio", "Messaggio non coerente.");
  }
  let signature: Uint8Array;
  let publicKey: Uint8Array;
  try {
    signature = bs58.decode(signatureBase58);
    publicKey = bs58.decode(row.address);
  } catch {
    throw new HttpError(400, "firma", "Firma non valida.");
  }
  if (!verifySolanaSignature(message, signature, publicKey)) {
    throw new HttpError(400, "firma", "La firma non corrisponde al portafoglio.");
  }
  try {
    withTx(db, () => {
      db.prepare("UPDATE nonces SET used = 1 WHERE nonce = ? AND used = 0").run(row.nonce);
      db.prepare("UPDATE users SET wallet = ?, wallet_linked_at = ? WHERE id = ?").run(
        row.address,
        new Date(nowMs).toISOString(),
        userId,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("users.wallet")) {
      throw new HttpError(409, "portafoglio", "Questo portafoglio è già collegato a un altro profilo.");
    }
    throw error;
  }
  return { wallet: row.address };
}

function uriMatches(uri: string, domain: string): boolean {
  try {
    return new URL(uri).host === domain;
  } catch {
    return false;
  }
}

export function preparePolygon(db: DB, userId: number, address: string, nowMs: number): { message: string } {
  if (!isAddress(address)) throw new HttpError(400, "indirizzo", "Indirizzo Polygon non valido.");
  const checksum = getAddress(address);
  const nonce = storeNonce(db, userId, "polygon", "pending", checksum, nowMs);
  const message = `ZQuest collega l'indirizzo Polygon ${checksum} al profilo ${userId}. Non è una transazione e non muove fondi. Nonce: ${nonce}`;
  db.prepare("UPDATE nonces SET message = ? WHERE nonce = ?").run(message, nonce);
  return { message };
}

export async function confirmPolygon(
  db: DB,
  userId: number,
  message: string,
  signature: string,
  nowMs: number,
): Promise<{ address: string }> {
  const row = db
    .prepare("SELECT * FROM nonces WHERE message = ? AND user_id = ? AND purpose = 'polygon'")
    .get(message, userId) as
    | { nonce: string; address: string; expires_at: number; used: number }
    | undefined;
  if (!row || row.used || row.expires_at < nowMs) {
    throw new HttpError(400, "nonce", "Messaggio scaduto o già usato. Chiedine uno nuovo.");
  }
  if (!signature.startsWith("0x")) throw new HttpError(400, "firma", "Firma non valida.");
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  } catch {
    throw new HttpError(400, "firma", "Firma non valida.");
  }
  if (getAddress(recovered) !== getAddress(row.address)) {
    throw new HttpError(400, "firma", "La firma non corrisponde all'indirizzo Polygon.");
  }
  try {
    withTx(db, () => {
      db.prepare("UPDATE nonces SET used = 1 WHERE nonce = ? AND used = 0").run(row.nonce);
      db.prepare("UPDATE users SET polygon_wallet = ?, polygon_linked_at = ? WHERE id = ?").run(
        getAddress(row.address),
        new Date(nowMs).toISOString(),
        userId,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("polygon_wallet")) {
      throw new HttpError(409, "portafoglio", "Questo indirizzo Polygon è già collegato a un altro profilo.");
    }
    throw error;
  }
  return { address: getAddress(row.address) };
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowMs: number,
  maxAgeSec = 86_400,
): { id: number; username?: string } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !botToken) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const left = Buffer.from(calc);
  const right = Buffer.from(hash);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || nowMs / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get("user") || "{}") as { id?: number; username?: string };
    if (!user.id) return null;
    return { id: user.id, username: user.username };
  } catch {
    return null;
  }
}

export function userFromAuth(db: DB, config: Config, header: string | undefined, nowMs: number): User | null {
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const id = readSession(config.sessionSecret, token, nowMs);
  if (!id) return null;
  return getUser(db, id) ?? null;
}
