/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useState } from "react";
import { api, STATUS, type Me } from "./api";
import { Banner, Button, Gate, Panel, Sprite, useSession } from "./ui";

export function Home() {
  const { pub, me, refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "bad" | undefined>(undefined);

  async function checkin() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{
        already: boolean;
        roll: number;
        prizeLabel: string;
        paidLabel: string;
        amount: string;
        streak: number;
        streakBonus: string;
        limit: string | null;
      }>("/api/checkin", { method: "POST", body: {} });
      if (result.already) {
        setTone(undefined);
        setMessage(`Check-in di oggi già fatto. Serie: ${result.streak} giorni.`);
      } else {
        setTone(result.limit ? "bad" : "ok");
        const bonus = result.streakBonus !== "0" ? ` Bonus serie: ${result.streakBonus} $OV.` : "";
        setMessage(
          `Estrazione ${result.roll} su 10000. ${result.prizeLabel}. In coda: ${result.amount} $OV (${result.paidLabel}).${bonus}`,
        );
      }
      await refresh();
    } catch (caught) {
      setTone("bad");
      setMessage(caught instanceof Error ? caught.message : "Check-in non riuscito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="hero-art">
        <Sprite name="coin" size={72} alt="Moneta d'oro con la Z viola" />
        <Sprite name="zillo" size={72} alt="Zillo, moneta con le gambe e i piedi di mattone" />
        <Sprite name="star" size={48} alt="Stella geometrica" />
      </div>
      {pub?.disclaimers.slice(0, 2).map((line) => (
        <Banner key={line}>{line}</Banner>
      ))}
      <Gate>
        <CheckinCard me={me} busy={busy} onCheckin={() => void checkin()} />
      </Gate>
      {message ? <Banner tone={tone}>{message}</Banner> : null}
      <div className="grid-3">
        <a className="tile" href="#/giochi/riflessi">
          <Sprite name="star" size={24} alt="" />
          <strong>Riflessi</strong>
          <span className="tiny muted">Tocchi quando il riquadro diventa oro.</span>
        </a>
        <a className="tile" href="#/giochi/salto">
          <Sprite name="zillo" size={24} alt="" />
          <strong>Salto di Zillo</strong>
          <span className="tiny muted">La moneta scavalca i mattoni.</span>
        </a>
        <a className="tile" href="#/giochi/quiz">
          <Sprite name="coin" size={24} alt="" />
          <strong>Quiz ZLang</strong>
          <span className="tiny muted">Cinque domande sulle regole.</span>
        </a>
      </div>
      <Panel title="Tabella di oggi" tone="quiet">
        <p className="tiny">Numero uniforme da 0 a 9999. Gli intervalli sono fissi.</p>
        <table>
          <thead>
            <tr><th>Esito</th><th>Probabilità</th><th>$OV</th><th>Numeri</th></tr>
          </thead>
          <tbody>
            {pub?.checkin.map((prize) => (
              <tr key={prize.code}>
                <td>{prize.label}</td>
                <td>{prize.percent}%</td>
                <td>{prize.human}</td>
                <td>{prize.from}–{prize.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted">
          Ogni {pub?.streak.every} giorni di fila: {pub?.streak.human} $OV fissi, non casuali, sempre dentro i tetti.
          Oggi restano {pub?.ov.todayRemaining} $OV nel tetto di comunità.
        </p>
      </Panel>
    </div>
  );
}

function CheckinCard({ me, busy, onCheckin }: { me: Me | null; busy: boolean; onCheckin: () => void }) {
  if (!me) return null;
  return (
    <Panel title="Check-in">
      <div className="spread">
        <div>
          <div className="muted tiny">Serie</div>
          <div className="roll">{me.streak}</div>
        </div>
        <Sprite name="brick" size={32} alt="" />
      </div>
      <p>{me.checkinToday ? "Il check-in di oggi è già nel registro." : "Una volta al giorno, ora UTC. Non si paga per farlo."}</p>
      <Button onClick={onCheckin} disabled={busy || me.checkinToday}>
        {me.checkinToday ? "Già fatto" : busy ? "Estraggo…" : "Fai il check-in"}
      </Button>
      {me.claims[0] ? (
        <p className="tiny">
          Ultimo movimento: {me.claims[0].amount} {me.claims[0].asset} · {STATUS[me.claims[0].status] ?? me.claims[0].status}
        </p>
      ) : (
        <p className="tiny muted">Nessun omaggio in coda.</p>
      )}
    </Panel>
  );
}
