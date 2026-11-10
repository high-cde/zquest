/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useState } from "react";
import bs58 from "bs58";
import { api, setSessionToken, type Me } from "./api";
import { Banner, Button, Gate, Panel, useSession } from "./ui";

type GuideSection = { id: string; title: string; paragraphs: string[]; seen: boolean };
type Row = { name: string; score: number; demo: boolean };

export function ExtraMenu() {
  const { me } = useSession();
  return (
    <Panel title="Altro">
      <nav className="menu">
        <a href="#/classifica">Classifica <span>→</span></a>
        <a href="#/portafoglio">Portafoglio <span>→</span></a>
        <a href="#/guida">Guida <span>→</span></a>
        <a href="#/regole">Regole e premi <span>→</span></a>
        <a href="#/privacy">Dati personali <span>→</span></a>
        <a href="#/admin">Amministrazione <span>→</span></a>
        <a href="https://swap.x-zdos.it">ZSwap, sito collegato <span>↗</span></a>
      </nav>
      {me ? <p className="tiny muted">Sei {me.displayName}{me.demo ? " (dimostrazione)" : ""}.</p> : <p className="tiny">Non hai ancora una sessione.</p>}
    </Panel>
  );
}

export function LeaderboardPage() {
  const [game, setGame] = useState("salto");
  const [period, setPeriod] = useState("settimana");
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void api<{ rows: Row[]; order: string }>(`/api/classifica?gioco=${game}&periodo=${period}`)
      .then((data) => {
        setRows(data.rows);
        setNote(data.order === "asc" ? "Nei riflessi vince il tempo più basso." : null);
      })
      .catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Errore"));
  }, [game, period]);

  return (
    <Panel title="Classifica">
      <div className="row">
        {["riflessi", "salto", "quiz"].map((item) => (
          <Button key={item} tone={game === item ? undefined : "ghost"} onClick={() => setGame(item)}>{item}</Button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <Button tone={period === "settimana" ? undefined : "ghost"} onClick={() => setPeriod("settimana")}>Settimana</Button>
        <Button tone={period === "sempre" ? undefined : "ghost"} onClick={() => setPeriod("sempre")}>Sempre</Button>
      </div>
      {rows.length === 0 ? <p>Nessun punteggio in questo periodo.</p> : (
        <table>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`}><td>{index + 1}</td><td>{row.name}{row.demo ? " · demo" : ""}</td><td>{row.score}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {note ? <p className="tiny muted">{note}</p> : null}
    </Panel>
  );
}

type SolanaProvider = {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};

export function WalletPage() {
  const { me, refresh } = useSession();
  const [note, setNote] = useState<string | null>(null);

  async function linkSolana() {
    const provider = phantomSolana();
    if (!provider) {
      setNote("Phantom non è in questa pagina. Aprilo in un browser con l'estensione, oppure nel browser di Phantom.");
      return;
    }
    const connected = await provider.connect();
    const address = connected.publicKey.toString();
    const prepared = await api<{ message: string }>("/api/siws/prepara", {
      body: { address, domain: window.location.host, uri: window.location.origin },
    });
    const signed = await provider.signMessage(new TextEncoder().encode(prepared.message), "utf8");
    await api("/api/siws/verifica", { body: { message: prepared.message, signature: bs58.encode(signed.signature) } });
    setNote("Portafoglio Solana collegato. La firma non ha mosso fondi.");
    await refresh();
  }

  async function linkPolygon() {
    const provider = phantomEvm();
    if (!provider) {
      setNote("Non trovo un portafoglio Ethereum/Polygon in questa pagina.");
      return;
    }
    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    const address = accounts[0];
    if (!address) return;
    const prepared = await api<{ message: string }>("/api/polygon/prepara", { body: { address } });
    const signature = (await provider.request({
      method: "personal_sign",
      params: [prepared.message, address],
    })) as string;
    await api("/api/polygon/verifica", { body: { message: prepared.message, signature } });
    setNote("Indirizzo Polygon collegato. Non è stata inviata una transazione.");
    await refresh();
  }

  return (
    <Gate>
      <div className="stack">
        <Panel title="Portafoglio">
          <p>Un account Telegram, un indirizzo Solana, un indirizzo Polygon. La firma dimostra il controllo e non trasferisce nulla.</p>
          <p>Solana: {me?.wallet ?? "non collegato"}</p>
          <p>Polygon: {me?.polygonWallet ?? "non collegato"}</p>
          <div className="row">
            <Button onClick={() => void linkSolana().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Firma annullata."))}>Firma con Phantom</Button>
            <Button tone="brick" onClick={() => void linkPolygon().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Firma annullata."))}>Firma Polygon</Button>
          </div>
          <p className="tiny muted">ZQuest non chiede la seed phrase. Se una pagina la chiede, chiudila.</p>
        </Panel>
        <Claims me={me} />
        {note ? <Banner>{note}</Banner> : null}
      </div>
    </Gate>
  );
}

function Claims({ me }: { me: Me | null }) {
  if (!me?.claims.length) return <Panel title="Coda" tone="quiet"><p>Nessun omaggio in coda.</p></Panel>;
  return (
    <Panel title="Coda" tone="quiet">
      <table>
        <tbody>
          {me.claims.map((claim) => (
            <tr key={claim.id}>
              <td>{claim.day}</td>
              <td>{claim.amount} {claim.asset}</td>
              <td>{claim.reason}</td>
              <td>{claim.status === "dry_run" ? "prova" : claim.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function phantomSolana(): SolanaProvider | null {
  const win = window as unknown as { phantom?: { solana?: SolanaProvider }; solana?: SolanaProvider };
  const provider = win.phantom?.solana ?? win.solana;
  return provider?.isPhantom ? provider : null;
}

function phantomEvm(): { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null {
  const win = window as unknown as { phantom?: { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }; ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } };
  return win.phantom?.ethereum ?? win.ethereum ?? null;
}

export function GuidePage({ sectionId }: { sectionId?: string }) {
  const { me } = useSession();
  const [sections, setSections] = useState<GuideSection[]>([]);
  useEffect(() => {
    void api<{ sections: GuideSection[] }>("/api/guida").then((data) => setSections(data.sections));
  }, [sectionId]);
  const current = sections.find((section) => section.id === sectionId) ?? null;

  async function open(section: GuideSection) {
    if (me) await api(`/api/guida/${section.id}`, { method: "POST", body: {} }).catch(() => undefined);
    window.location.hash = `#/guida/${section.id}`;
  }

  return (
    <div className="stack">
      <Panel title="Guida">
        {!current ? (
          <nav className="menu">
            {sections.map((section) => (
              <a key={section.id} href={`#/guida/${section.id}`} onClick={(event) => { event.preventDefault(); void open(section); }}>
                {section.title} <span>{section.seen ? "letta" : "apri"}</span>
              </a>
            ))}
          </nav>
        ) : (
          <>
            <h3>{current.title}</h3>
            {current.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {current.id === "zswap" ? <p><a href="https://swap.x-zdos.it">Apri ZSwap in un'altra scheda</a>. ZQuest non esegue lo scambio.</p> : null}
            <Button tone="ghost" onClick={() => { window.location.hash = "#/guida"; }}>Tutte le schede</Button>
          </>
        )}
      </Panel>
    </div>
  );
}

export function RulesPage() {
  const { pub } = useSession();
  return (
    <div className="stack">
      <Panel title="Regole">
        <ul className="list">
          <li>Check-in, giochi e quest sono gratuiti. Non si punta e non si paga per partecipare.</li>
          <li>Il check-in estrae un numero da 0 a 9999 e lo legge sulla tabella pubblica.</li>
          <li>I tetti giornalieri e il budget possono ridurre un premio a zero. Il motivo resta scritto.</li>
          <li>Gli omaggi entrano in coda. Parte un invio solo dopo approvazione e solo se REWARDS_LIVE è attivo.</li>
          <li>Oggi gli invii sono {pub?.rewardsLive ? "attivi" : "in prova: l'approvazione non crea una transazione"}.</li>
        </ul>
      </Panel>
      <Panel title="Tetti di comunità" tone="quiet">
        <p>$OV ({pub?.ov.name}), {pub?.ov.decimals} decimali da {pub?.ov.decimalsSource === "chain" ? "chain" : "configurazione"}. Tetto personale {pub?.ov.userCap}, tetto del giorno {pub?.ov.globalCap}, ancora oggi {pub?.ov.todayRemaining}. Budget rimasto {pub?.ov.budgetRemaining}.</p>
        <p>$DSN ({pub?.dsn.name}), {pub?.dsn.decimals} decimali da {pub?.dsn.decimalsSource === "chain" ? "chain" : "configurazione"}. Tetto personale {pub?.dsn.userCap}, tetto del giorno {pub?.dsn.globalCap}. Budget rimasto {pub?.dsn.budgetRemaining}.</p>
        <p className="tiny">Mint $OV: <code>{pub?.ov.address}</code></p>
        <p className="tiny">Contratto $DSN: <code>{pub?.dsn.address}</code></p>
      </Panel>
      <Panel title="Nota legale">
        <p>Le operazioni a premio e il loro trattamento fiscale, in Italia, vanno fatti vedere a un professionista prima di accendere gli invii veri. Questo software non è un parere.</p>
      </Panel>
    </div>
  );
}

export function PrivacyPage() {
  const { pub, me, refresh } = useSession();
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="stack">
      <Panel title="Dati personali">
        <p>Raccogliamo l'identificativo Telegram, l'username, il nome scelto, gli indirizzi se li colleghi, i punteggi e la coda premi. Se usi gli incontri, anche bio, like, blocchi e segnalazioni.</p>
        <p>Servono a far funzionare quello che chiedi. Gli incontri stanno su un consenso separato, togliibile.</p>
        <p>Contatto: {pub?.privacyContact}. Termini incontri, versione {pub?.termsVersion}.</p>
        <p>Con «Cancella incontri» togli il profilo sociale. Con «Anonimizza account» togli anche nome, username e indirizzi. I movimenti di budget restano su un id interno, senza quei dati, altrimenti il conto del budget non torna. Se hai dichiarato meno di 18 anni, quel blocco tecnico resta.</p>
      </Panel>
      {me ? (
        <Panel title="Azioni" tone="brick">
          <label className="field">
            <span>Scrivi CANCELLA</span>
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          <div className="row">
            <Button tone="ghost" onClick={() => void erase("incontri")}>Cancella incontri</Button>
            <Button tone="brick" onClick={() => void erase("account")}>Anonimizza account</Button>
            <Button tone="ghost" onClick={() => { setSessionToken(null); void refresh(); }}>Esci da questa sessione</Button>
          </div>
        </Panel>
      ) : null}
      {note ? <Banner>{note}</Banner> : null}
    </div>
  );

  async function erase(scope: "incontri" | "account") {
    try {
      await api("/api/me/cancella", { body: { scope, confirm } });
      if (scope === "account") setSessionToken(null);
      setNote(scope === "account" ? "Account anonimizzato." : "Dati incontri cancellati.");
      await refresh();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Non cancellato.");
    }
  }
}
