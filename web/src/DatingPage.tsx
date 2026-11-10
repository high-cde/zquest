/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useState } from "react";
import { api } from "./api";
import { Banner, Button, Gate, Panel } from "./ui";

type DatingState = {
  beta: boolean;
  note: string;
  ageGate: string | null;
  termsAccepted: boolean;
  optedIn: boolean;
  underLock: boolean;
  interests: string[];
  shareUsername: boolean;
  profile: { bio: string; interests: string[]; city: string | null; visible: boolean } | null;
};

type Card = { userId: number; displayName: string; bio: string; interests: string[]; city: string | null } | null;

export function DatingPage() {
  const [state, setState] = useState<DatingState | null>(null);
  const [years, setYears] = useState("18");
  const [accept, setAccept] = useState(false);
  const [self, setSelf] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [share, setShare] = useState(false);
  const [card, setCard] = useState<Card>(null);
  const [matches, setMatches] = useState<Array<{ userId: number; displayName: string; bio: string; username: string | null }>>([]);

  async function load() {
    const next = await api<DatingState>("/api/incontri");
    setState(next);
    if (next.profile) {
      setBio(next.profile.bio);
      setCity(next.profile.city ?? "");
      setPicked(next.profile.interests);
      setShare(next.shareUsername);
    }
    if (next.optedIn && next.profile) {
      const found = await api<{ profile: Card }>("/api/incontri/scopri");
      setCard(found.profile);
      const list = await api<{ matches: typeof matches }>("/api/incontri/match");
      setMatches(list.matches);
    }
  }

  useEffect(() => {
    void load().catch((caught: unknown) => setNote(caught instanceof Error ? caught.message : "Errore"));
  }, []);

  function fail(caught: unknown) {
    setNote(caught instanceof Error ? caught.message : "Operazione non riuscita.");
  }

  return (
    <Gate>
      <div className="stack">
        <Banner>Beta. Servizio separato dai premi: niente gettoni, niente pagamenti, niente foto.</Banner>
        <Panel title="Incontri 18+">
          <p>{state?.note}</p>
          {state?.underLock ? <p className="bad">Questo profilo ha dichiarato meno di 18 anni. Gli incontri restano chiusi.</p> : null}
          {!state?.termsAccepted && !state?.underLock ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api("/api/incontri/dichiarazione", {
                  body: { years: Number(years), acceptTerms: accept, confirmSelfDeclaration: self },
                })
                  .then(load)
                  .catch(fail);
              }}
            >
              <label className="field">
                <span>Anni compiuti</span>
                <input inputMode="numeric" value={years} onChange={(event) => setYears(event.target.value)} />
              </label>
              <label className="field"><span><input type="checkbox" checked={self} onChange={(event) => setSelf(event.target.checked)} /> Dichiaro di avere almeno 18 anni. È un'autodichiarazione, non una verifica del documento.</span></label>
              <label className="field"><span><input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} /> Accetto i termini: profilo facoltativo, doppio consenso, blocco e segnalazione, niente contenuti espliciti.</span></label>
              <Button type="submit">Confermo l'autodichiarazione</Button>
            </form>
          ) : null}
          {state?.termsAccepted ? (
            <div className="row">
              <Button
                tone={state.optedIn ? "ghost" : undefined}
                onClick={() => void api("/api/incontri/partecipa", { body: { optIn: !state.optedIn } }).then(load).catch(fail)}
              >
                {state.optedIn ? "Esci dagli incontri" : "Partecipa"}
              </Button>
            </div>
          ) : null}
        </Panel>
        {state?.optedIn ? (
          <Panel title="Profilo" tone="quiet">
            <label className="field">
              <span>Bio, 20-180 caratteri, senza link</span>
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
            </label>
            <label className="field">
              <span>Città, facoltativa</span>
              <input value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <div className="checks">
              {state.interests.map((interest) => (
                <label key={interest} className={picked.includes(interest) ? "on" : ""}>
                  <input
                    type="checkbox"
                    checked={picked.includes(interest)}
                    onChange={() =>
                      setPicked(picked.includes(interest) ? picked.filter((item) => item !== interest) : [...picked, interest])
                    }
                  />
                  {interest}
                </label>
              ))}
            </div>
            <label className="field">
              <span>
                <input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} /> Mostra il mio username Telegram solo se anche l'altra persona lo mostra.
              </span>
            </label>
            <Button
              onClick={() =>
                void api("/api/incontri/profilo", { method: "PUT", body: { bio, city, interests: picked, shareUsername: share } })
                  .then(load)
                  .then(() => setNote("Profilo salvato."))
                  .catch(fail)
              }
            >
              Salva profilo
            </Button>
          </Panel>
        ) : null}
        {state?.optedIn && state.profile ? (
          <Panel title="Una persona">
            {card ? (
              <>
                <h3>{card.displayName}</h3>
                <p>{card.bio}</p>
                <p className="tiny muted">{card.interests.join(" · ")}{card.city ? ` · ${card.city}` : ""}</p>
                <div className="row">
                  <Button onClick={() => void choose(card.userId, "like")}>Mi interessa</Button>
                  <Button tone="ghost" onClick={() => void choose(card.userId, "pass")}>Passo</Button>
                  <Button tone="brick" onClick={() => void api("/api/incontri/blocca", { body: { userId: card.userId } }).then(load)}>Blocca</Button>
                  <Button tone="ghost" onClick={() => void api("/api/incontri/segnala", { body: { userId: card.userId, reason: "profilo" } }).then(() => setNote("Segnalazione inviata."))}>Segnala</Button>
                </div>
              </>
            ) : (
              <p>Nessun profilo in giro. All'inizio è normale: non ci sono persone finte da mostrare.</p>
            )}
          </Panel>
        ) : null}
        {matches.length ? (
          <Panel title="Match">
            {matches.map((match) => (
              <p key={match.userId}><strong>{match.displayName}</strong> — {match.bio}{match.username ? ` · @${match.username}` : ""}</p>
            ))}
          </Panel>
        ) : null}
        <Panel title="Cancellazione" tone="brick">
          <p className="tiny">Toglie profilo, like, match e blocchi. Non tocca la coda dei premi, che non c'entra con gli incontri.</p>
          <Button
            tone="brick"
            onClick={() => void api("/api/incontri", { method: "DELETE" }).then(load).then(() => setNote("Dati degli incontri cancellati.")).catch(fail)}
          >
            Cancella i dati incontri
          </Button>
        </Panel>
        {note ? <Banner>{note}</Banner> : null}
      </div>
    </Gate>
  );

  async function choose(userId: number, kind: "like" | "pass") {
    try {
      const result = await api<{ matched: boolean }>("/api/incontri/scelta", { body: { userId, kind } });
      setNote(result.matched ? "Match: anche l'altra persona aveva detto sì." : "Scelta registrata.");
      await load();
    } catch (caught) {
      fail(caught);
    }
  }
}
