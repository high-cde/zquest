/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { Config } from "./config.js";
import type { Claim } from "./db.js";

export function keypairFromSecret(raw: string): Keypair {
  const text = raw.trim();
  try {
    if (text.startsWith("[")) {
      const numbers = JSON.parse(text) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(numbers));
    }
    const bytes = bs58.decode(text);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) return Keypair.fromSeed(bytes);
  } catch {
    throw new Error("chiave OV non valida");
  }
  throw new Error("chiave OV non valida");
}

export function ovPublicFromSecret(raw: string): string {
  return keypairFromSecret(raw).publicKey.toBase58();
}

export async function sendOv(claim: Claim, config: Config): Promise<string> {
  if (!config.rewardsLive) throw new Error("invio disattivato");
  if (!config.ov.rewardsSecret) throw new Error("chiave OV assente");
  if (!claim.destination) throw new Error("destinazione assente");
  const payer = keypairFromSecret(config.ov.rewardsSecret);
  const connection = new Connection(config.solanaRpc, "confirmed");
  const mint = new PublicKey(config.ov.address);
  const destination = new PublicKey(claim.destination);
  const fromAta = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const toAta = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_2022_PROGRAM_ID);
  const amount = BigInt(claim.amount_atomic);
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      toAta,
      destination,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      payer.publicKey,
      amount,
      config.ov.decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  return sendAndConfirmTransaction(connection, transaction, [payer], { commitment: "confirmed" });
}
