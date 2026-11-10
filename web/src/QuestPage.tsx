/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useState } from "react";
import { api } from "./api";
import { Banner, Button, Gate, Panel } from "./ui";

type QuestItem = { code: string; title: string; human: number; status: string; detail: string };
type QuestPayload = { inviteCode: string; inviteRewards: number; inviteMax: number; items: QuestItem[] };

const LABELS: Record<string, string> = {
  aperta: "aperta",
  pronta: "pronta da chiudere",
  fatta: "chiusa",
  in_revisione: "in revisione",
  rifiutata: "non accettata",
};

export function QuestPage() {
  const [data, setData] = useState<QuestPayload | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");

  async function load() {
    setData(await api<QuestPayload>("/api/quest"));
  }
  useEffect(() => {
    void load().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Errore"));
  }, []);

  async function claim(quest: string) {
    setNote(null);
    try {
      const result = await api<{ amount: string }>("/api/quest/riscuoti", { body: { code: quest } });
      setNote(`In coda: ${result.amount} $DSN. Nessun invio parte da solo.`);
      await load();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Non riscossa.");
    }
  }

  return (
    <Gate>
      <div className="stack">
        <Panel title="Quest $DSN">
          <p>Premiano attività verificabili qui. Nessuna quest per like, repost o follow su X.</p>
          {data?.items.map((item) => (
            <article key={item.code} style={{ marginBottom: 14 }}>
              <div className="spread">
                <strong>{item.title}</strong>
                <span className="tiny">{item.human} $DSN</span>
              </div>
              <p className="tiny muted">{item.detail}</p>
              <p className="tiny">{LABELS[item.status] ?? item.status}</p>
              {item.status === "pronta" ? <Button onClick={() => void claim(item.code)}>Metti in coda</Button> : null}
            </article>
          ))}
        </Panel>
        <Panel title="Invito" tone="quiet">
          <p>Il tuo codice: <code>{data?.inviteCode}</code></p>
          <p className="tiny">Premi già dati: {data?.inviteRewards ?? 0}/{data?.inviteMax ?? 5}. L'omaggio parte quando chi inviti ha fatto almeno un check-in, dentro i tetti.</p>
          <label className="field">
            <span>Codice ricevuto</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ABC234" />
          </label>
          <Button
            onClick={() =>
              void api("/api/quest/invito", { body: { code } })
                .then(() => setNote("Invito registrato."))
                .catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Invito rifiutato."))
            }
          >
            Registra invito
          </Button>
        </Panel>
        <Panel title="Contributo GitHub">
          <p className="tiny">Un link pubblico a una pull request o a una issue. Lo guarda una persona, non un automatismo.</p>
          <label className="field">
            <span>URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://github.com/org/repo/pull/1" />
          </label>
          <Button
            tone="brick"
            onClick={() =>
              void api("/api/quest/github", { body: { url } })
                .then(() => load())
                .then(() => setNote("In revisione."))
                .catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Link rifiutato."))
            }
          >
            Invia il link
          </Button>
        </Panel>
        {note ? <Banner>{note}</Banner> : null}
      </div>
    </Gate>
  );
}
