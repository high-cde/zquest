/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useState } from "react";
import bs58 from "bs58";
import { api, STATUS } from "./api";
import { Banner, Button, Gate, Panel, Sprite, useSession } from "./ui";

type Mission = {
  code: string;
  title: string;
  detail: string;
  optional: boolean;
  symbol: string;
  name: string;
  amount: number;
  ready: boolean;
  claimed: boolean;
};

type TokenInfo = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  program: string;
  walletCap: number;
  dailyCap: number;
  cooldownSec: number;
  paused: boolean;
  note: string;
};

type HistoryRow = { mission: string; symbol: string; amount: string; status: string; createdAt: string };

type AirdropPayload = {
  rewardsLive: boolean;
  disclaimer: string;
  paused: boolean;
  wallet: string | null;
  progress: { done: number; total: number };
  tokens: TokenInfo[];
  missions: Mission[];
  history: HistoryRow[];
};

export function AirdropPage() {
  const { me, refresh } = useSession();
  const [data, setData] = useState<AirdropPayload | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setData(await api<AirdropPayload>("/api/airdrop"));
  }

  useEffect(() => {
    void load().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Errore"));
  }, [me?.wallet, me?.id]);

  const percent = data && data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;

  return (
    <div className="stack">
      <section className="drop-sky" aria-hidden="true">
        <img className="sprite drop-coin" src="/art/coin.png" alt="" style={{ left: "12%", animationDelay: "0s" }} />
        <img className="sprite drop-coin" src="/art/star.png" alt="" style={{ left: "38%", animationDelay: "0.6s" }} />
        <img className="sprite drop-coin" src="/art/coin.png" alt="" style={{ left: "64%", animationDelay: "1.2s" }} />
        <img className="sprite drop-coin" src="/art/zillo.png" alt="" style={{ left: "82%", animationDelay: "0.3s" }} />
      </section>
      <Banner>
        Omaggio fisso di comunità, gratuito. Non è un guadagno e non promette un valore. {data?.rewardsLive ? "Gli invii on-chain sono attivi solo dal portafoglio airdrop dedicato." : "Invii in prova: il riscatto resta nel registro, senza transazione."}
      </Banner>
      {data?.paused ? <Banner tone="bad">Airdrop in pausa. I riscatti sono chiusi.</Banner> : null}
      <Panel title="Airdrop">
        <p>{data?.disclaimer}</p>
        <div className="spread">
          <span>Riscattate</span>
          <strong>{data?.progress.done ?? 0}/{data?.progress.total ?? 0}</strong>
        </div>
        <div className="meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          {data?.tokens.map((token) => (
            <article key={token.mint}>
              <strong>{token.name} ({token.symbol})</strong>
              <p className="tiny muted">{token.note} {token.decimals} decimali, programma {token.program === "token-2022" ? "Token\u20112022" : "Token"}. Tetto portafoglio {token.walletCap}, tetto oggi {token.dailyCap}. Attesa {token.cooldownSec}s.</p>
            </article>
          ))}
        </div>
      </Panel>
      <Gate>
        <Panel title="Missioni" tone="quiet">
          <p>Portafoglio: {me?.wallet ?? "non collegato"}. La firma non muove fondi.</p>
          {!me?.wallet ? <Button onClick={() => void connect().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Firma annullata."))}>Firma con Phantom</Button> : null}
          {data?.missions.map((mission) => (
            <article key={mission.code} className="mission">
              <div className="spread">
                <strong>{mission.title}{mission.optional ? " · facoltativa" : ""}</strong>
                <span>{mission.amount} {mission.symbol}</span>
              </div>
              <p className="tiny muted">{mission.detail}</p>
              {mission.claimed ? <p className="ok tiny">Già riscattata da questo portafoglio.</p> : null}
              {mission.code === "regole" && !mission.ready && !mission.claimed ? (
                <Button disabled={busy === "regole"} onClick={() => void ack()}>Ho letto le regole</Button>
              ) : null}
              {mission.ready && !mission.claimed ? (
                <Button disabled={busy === mission.code} onClick={() => void claim(mission.code)}>Riscuoti</Button>
              ) : null}
            </article>
          ))}
        </Panel>
        <Panel title="Storico">
          {data?.history.length ? (
            <table>
              <tbody>
                {data.history.map((row) => (
                  <tr key={`${row.mission}-${row.createdAt}`}>
                    <td>{row.mission}</td>
                    <td>{row.amount} {row.symbol}</td>
                    <td>{STATUS[row.status] ?? row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>Nessun riscatto ancora.</p>}
        </Panel>
      </Gate>
      {note ? <Banner tone={note.startsWith("Registrato") ? "ok" : undefined}>{note}</Banner> : null}
      <p className="tiny muted"><Sprite name="coin" size={16} alt="" /> Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati.</p>
    </div>
  );

  async function ack() {
    setBusy("regole");
    setNote(null);
    try {
      await api("/api/airdrop/regole", { method: "POST", body: {} });
      await load();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Non registrato.");
    } finally {
      setBusy(null);
    }
  }

  async function claim(code: string) {
    setBusy(code);
    setNote(null);
    try {
      const result = await api<{ status: string; amount: string; symbol: string; detail: string }>("/api/airdrop/riscuoti", { body: { code } });
      setNote(`${result.detail} ${result.amount} ${result.symbol}.`);
      await load();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Riscatto non riuscito.");
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    const win = window as unknown as { phantom?: { solana?: SolanaProvider }; solana?: SolanaProvider };
    const provider = win.phantom?.solana ?? win.solana;
    if (!provider?.isPhantom) throw new Error("Phantom non è in questa pagina. Aprilo in un browser con l'estensione.");
    const connected = await provider.connect();
    const address = connected.publicKey.toString();
    const prepared = await api<{ message: string }>("/api/siws/prepara", {
      body: { address, domain: window.location.host, uri: window.location.origin },
    });
    const signed = await provider.signMessage(new TextEncoder().encode(prepared.message), "utf8");
    await api("/api/siws/verifica", { body: { message: prepared.message, signature: bs58.encode(signed.signature) } });
    setNote("Portafoglio collegato. La firma non ha mosso fondi.");
    await refresh();
  }
}

type SolanaProvider = {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};
