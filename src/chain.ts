/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import type { Config } from "./config.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export type MintInfo = {
  decimals: number;
  program: "token" | "token-2022";
  symbol: string | null;
  name: string | null;
};

export async function readMintInfo(rpc: string, mint: string): Promise<MintInfo> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mint, { encoding: "jsonParsed" }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await response.json()) as {
    result?: {
      value?: {
        owner?: string;
        data?: {
          parsed?: {
            info?: {
              decimals?: number;
              extensions?: Array<{ extension?: string; state?: { symbol?: string; name?: string } }>;
            };
          };
        };
      };
    };
  };
  const value = json.result?.value;
  const decimals = value?.data?.parsed?.info?.decimals;
  if (!value?.owner || typeof decimals !== "number") throw new Error("mint non letto");
  const program = value.owner === TOKEN_2022_PROGRAM ? "token-2022" : value.owner === TOKEN_PROGRAM ? "token" : null;
  if (!program) throw new Error("programma token non riconosciuto");
  const meta = value.data?.parsed?.info?.extensions?.find((item) => item.extension === "tokenMetadata")?.state;
  return { decimals, program, symbol: meta?.symbol ?? null, name: meta?.name ?? null };
}

export async function readOvDecimals(rpc: string, mint: string): Promise<number> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mint, { encoding: "jsonParsed" }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await response.json()) as {
    result?: { value?: { data?: { parsed?: { info?: { decimals?: number } } } } };
  };
  const decimals = json.result?.value?.data?.parsed?.info?.decimals;
  if (typeof decimals !== "number") throw new Error("mint $OV non letto");
  return decimals;
}

export async function readDsnDecimals(rpc: string, contract: string): Promise<number> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: contract, data: "0x313ce567" }, "latest"],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await response.json()) as { result?: string };
  if (!json.result || json.result === "0x") throw new Error("decimali $DSN non letti");
  return Number(BigInt(json.result));
}

export async function refreshDecimals(config: Config, log: (line: string) => void): Promise<void> {
  try {
    const decimals = await readOvDecimals(config.solanaRpc, config.ov.address);
    config.ov.decimals = decimals;
    config.ov.decimalsSource = "chain";
    log(`$OV decimali letti dal mint: ${decimals}`);
  } catch (error) {
    log(`$OV decimali non riletti (${error instanceof Error ? error.message : "errore"}), uso ${config.ov.decimals} da env.`);
  }
  try {
    const decimals = await readDsnDecimals(config.polygonRpc, config.dsn.address);
    config.dsn.decimals = decimals;
    config.dsn.decimalsSource = "chain";
    log(`$DSN decimali letti dal contratto: ${decimals}`);
  } catch (error) {
    log(`$DSN decimali non riletti (${error instanceof Error ? error.message : "errore"}), uso ${config.dsn.decimals} da env.`);
  }
}
