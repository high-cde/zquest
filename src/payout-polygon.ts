/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { createWalletClient, http, parseAbi, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import type { Config } from "./config.js";
import type { Claim } from "./db.js";

function accountFrom(raw: string) {
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hex)) throw new Error("chiave DSN non valida");
  return privateKeyToAccount(hex);
}

export function dsnPublicFromSecret(raw: string): string {
  return accountFrom(raw).address;
}

export async function sendDsn(claim: Claim, config: Config): Promise<string> {
  if (!config.rewardsLive) throw new Error("invio disattivato");
  if (!config.dsn.rewardsSecret) throw new Error("chiave DSN assente");
  if (!claim.destination) throw new Error("destinazione assente");
  const account = accountFrom(config.dsn.rewardsSecret);
  const client = createWalletClient({
    account,
    chain: polygon,
    transport: http(config.polygonRpc),
  }).extend(publicActions);
  return client.writeContract({
    address: config.dsn.address as `0x${string}`,
    abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]),
    functionName: "transfer",
    args: [claim.destination as `0x${string}`, BigInt(claim.amount_atomic)],
  });
}
