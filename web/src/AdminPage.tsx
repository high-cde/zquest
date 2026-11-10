/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useState, type FormEvent } from "react";
import { api, setAdminToken } from "./api";
import { Banner, Button, Panel } from "./ui";

type ClaimRow = {
  id: number;
  name: string;
  asset: string;
  amount: string;
  status: string;
  reason: string;
  walletReady: boolean;
  detail: string | null;
};
type Draft = { id: number; kind: string; body: string; intentUrl: string; status: string };
type Report = { id: number; reason: string; status: string; targetName: string | null; targetId: number };
type Github = { id: number; name: string | null; status: string; evidence: string | null };

export function AdminPage() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(Boolean(sessionStorage.getItem("zquest.admin")));
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [github, setGithub] = useState<Github[]>([]);
  const [summary, setSummary] = useState<string>("");

  async function load() {
    const head = await api<{ rewardsLive: boolean; queued: number; reports: number; budget: { ov: { remaining: string }; dsn: { remaining: string } } }>("/api/admin/riepilogo", { admin: true });
    setLive(head.rewardsLive);
    setSummary(`In coda ${head.queued}. Segnalazioni aperte ${head.reports}. Budget rimasto ${head.budget.ov.remaining} $OV e ${head.budget.dsn.remaining} $DSN.`);
    const queue = await api<{ claims: ClaimRow[] }>("/api/admin/coda", { admin: true });
    setClaims(queue.claims);
    const draftBox = await api<{ drafts: Draft[] }>("/api/admin/bozze", { admin: true });
    setDrafts(draftBox.drafts);
    const reportBox = await api<{ reports: Report[] }>("/api/admin/segnalazioni", { admin: true });
    setReports(reportBox.reports);
    const quests = await api<{ github: Github[] }>("/api/admin/quest", { admin: true });
    setGithub(quests.github);
  }

  async function enter(event: FormEvent) {
    event.preventDefault();
    setAdminToken(token);
    try {
      await load();
      setReady(true);
      setNote(null);
    } catch (caught) {
      setAdminToken(null);
      setReady(false);
      setNote(caught instanceof Error ? caught.message : "Token rifiutato.");
    }
  }

  if (!ready) {
    return (
      <Panel title="Amministrazione">
        <p>Il token resta nel browser, non nel codice. Le approvazioni, con il servizio in prova, non inviano transazioni.</p>
        <form onSubmit={(event) => void enter(event)}>
          <label className="field">
            <span>ADMIN_TOKEN</span>
            <input type="password" value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
          <Button type="submit">Entra</Button>
        </form>
        {note ? <Banner tone="bad">{note}</Banner> : null}
      </Panel>
    );
  }

  const ids = picked.length ? picked : claims.filter((claim) => claim.status === "queued").map((claim) => claim.id);

  return (
    <div className="stack">
      <Banner tone={live ? "bad" : "ok"}>{live ? "REWARDS_LIVE è acceso: un'approvazione può inviare fondi." : "Modalità prova: l'approvazione contabilizza, non invia."}</Banner>
      <Panel title="Quadro">
        <p>{summary}</p>
        <Button tone="ghost" onClick={() => void load().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Errore"))}>Aggiorna</Button>
      </Panel>
      <Panel title="Coda premi">
        {claims.length === 0 ? <p>Coda vuota.</p> : (
          <table>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td><input type="checkbox" checked={picked.includes(claim.id)} onChange={() => setPicked(picked.includes(claim.id) ? picked.filter((id) => id !== claim.id) : [...picked, claim.id])} /></td>
                  <td>{claim.name}<br /><span className="tiny muted">{claim.reason} · {claim.walletReady ? "portafoglio ok" : "portafoglio mancante"}</span></td>
                  <td>{claim.amount} {claim.asset}</td>
                  <td>{claim.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <Button onClick={() => void act("/api/admin/coda/approva", { ids })}>Approva selezione</Button>
          <Button tone="brick" onClick={() => void act("/api/admin/coda/rifiuta", { ids, detail: "rifiutato da pannello" })}>Rifiuta</Button>
        </div>
      </Panel>
      <Panel title="Bozze per X" tone="quiet">
        <p className="tiny">Nessun autopost. Si apre il compositore di X e pubblica una persona.</p>
        <div className="row">
          <Button onClick={() => void makeDraft("classifica")}>Classifica</Button>
          <Button onClick={() => void makeDraft("vincitori")}>Omaggi della settimana</Button>
        </div>
        {drafts.map((draft) => (
          <article key={draft.id} style={{ marginTop: 12 }}>
            <p>{draft.body}</p>
            <a href={draft.intentUrl}>Apri il compositore</a>
          </article>
        ))}
      </Panel>
      <Panel title="Segnalazioni">
        {reports.length === 0 ? <p>Nessuna segnalazione.</p> : reports.filter((report) => report.status === "open").map((report) => (
          <div key={report.id} className="spread">
            <span>{report.targetName ?? report.targetId} · {report.reason}</span>
            <span className="row">
              <Button onClick={() => void act(`/api/admin/segnalazioni/${report.id}`, { action: "dismiss" })}>Chiudi</Button>
              <Button tone="brick" onClick={() => void act(`/api/admin/segnalazioni/${report.id}`, { action: "ban" })}>Sospendi</Button>
            </span>
          </div>
        ))}
      </Panel>
      <Panel title="GitHub in revisione">
        {github.filter((row) => row.status === "in_revisione").length === 0 ? <p>Niente in attesa.</p> : github.filter((row) => row.status === "in_revisione").map((row) => (
          <div key={row.id}>
            <p>{row.name}: <a href={row.evidence ?? "#"}>{row.evidence}</a></p>
            <div className="row">
              <Button onClick={() => void act("/api/admin/quest/github", { id: row.id, accept: true })}>Accetta</Button>
              <Button tone="ghost" onClick={() => void act("/api/admin/quest/github", { id: row.id, accept: false })}>Rifiuta</Button>
            </div>
          </div>
        ))}
      </Panel>
      {note ? <Banner>{note}</Banner> : null}
    </div>
  );

  async function act(path: string, body: unknown) {
    try {
      await api(path, { admin: true, body });
      setPicked([]);
      await load();
      setNote("Fatto.");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Non eseguito.");
    }
  }

  async function makeDraft(kind: string) {
    try {
      await api("/api/admin/bozze", { admin: true, body: { kind } });
      await load();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Bozza rifiutata.");
    }
  }
}
