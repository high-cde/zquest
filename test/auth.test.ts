/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import assert from "node:assert/strict";
import test from "node:test";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { confirmPolygon, confirmSiws, preparePolygon, prepareSiws } from "../src/auth.js";
import { makeUser, testDb } from "./helpers.js";

test("Sign-In-With-Solana collega il portafoglio e non accetta la stessa firma due volte", () => {
  const { db, config } = testDb();
  const user = makeUser(db);
  const keys = nacl.sign.keyPair();
  const address = bs58.encode(keys.publicKey);
  const prepared = prepareSiws(db, config, user.id, address, Date.UTC(2026, 10, 7, 12), {
    domain: "quest.x-zdos.it",
    uri: "https://quest.x-zdos.it",
  });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(prepared.message), keys.secretKey));
  const linked = confirmSiws(db, user.id, prepared.message, signature, Date.UTC(2026, 10, 7, 12, 1));
  assert.equal(linked.wallet, address);
  assert.throws(() => confirmSiws(db, user.id, prepared.message, signature, Date.UTC(2026, 10, 7, 12, 2)));
});

test("la firma Polygon recupera l'indirizzo dichiarato", async () => {
  const { db } = testDb();
  const user = makeUser(db, "Rete");
  const account = privateKeyToAccount(generatePrivateKey());
  const prepared = preparePolygon(db, user.id, account.address, Date.UTC(2026, 10, 7, 12));
  const signature = await account.signMessage({ message: prepared.message });
  const linked = await confirmPolygon(db, user.id, prepared.message, signature, Date.UTC(2026, 10, 7, 12, 1));
  assert.equal(linked.address, account.address);
});
