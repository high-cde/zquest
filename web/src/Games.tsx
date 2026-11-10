/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useRef, useState } from "react";
import { JUMPER, createJumper, stepJumper, type JumperState } from "@domain/jumper";
import { api } from "./api";
import { Banner, Button, Gate, Panel, useSession } from "./ui";

type Mode = "classifica" | "prova";

export function GamesHome() {
  const { pub } = useSession();
  return (
    <div className="stack">
      <Panel title="Giochi di abilità">
        <p>Ingresso libero. La prima manche in classifica del giorno UTC può mettere un omaggio in coda. La prova no, e non entra in classifica.</p>
        <p className="tiny muted">Il server ricalcola riflessi, salti e quiz. Il numero che conta è il suo.</p>
      </Panel>
      <div className="grid-3">
        <a className="tile" href="#/giochi/riflessi"><strong>Riflessi</strong><span className="tiny">{pub?.games.riflessi.map((row) => `${row.label}: ${row.human}`).join(" · ")}</span></a>
        <a className="tile" href="#/giochi/salto"><strong>Salto di Zillo</strong><span className="tiny">{pub?.games.salto.map((row) => `${row.label}: ${row.human}`).join(" · ")}</span></a>
        <a className="tile" href="#/giochi/quiz"><strong>Quiz ZLang</strong><span className="tiny">{pub?.games.quiz.map((row) => `${row.label}: ${row.human}`).join(" · ")}</span></a>
      </div>
    </div>
  );
}

function ModePick({ value, locked, onChange }: { value: Mode; locked: boolean; onChange: (mode: Mode) => void }) {
  return (
    <div className="row">
      <Button tone={value === "classifica" ? undefined : "ghost"} disabled={locked} onClick={() => onChange("classifica")}>
        {locked ? "Classifica fatta" : "Classifica"}
      </Button>
      <Button tone={value === "prova" ? undefined : "ghost"} onClick={() => onChange("prova")}>Prova</Button>
    </div>
  );
}

export function ReflexGame() {
  const { me, refresh } = useSession();
  const [mode, setMode] = useState<Mode>("classifica");
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);
  const run = useRef<{ id: number; targetAt: number; offset: number } | null>(null);

  useEffect(() => {
    if (phase !== "wait" || !run.current) return;
    const delay = run.current.targetAt - (Date.now() + run.current.offset);
    const timer = window.setTimeout(() => setPhase("go"), Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function start() {
    setNote(null);
    const begun = await api<{ id: number; serverNow: number; targetAt: number }>("/api/giochi/riflessi", {
      body: { mode: me?.locks.riflessi ? "prova" : mode },
    });
    run.current = { id: begun.id, targetAt: begun.targetAt, offset: begun.serverNow - Date.now() };
    setPhase("wait");
  }

  async function tap() {
    if (!run.current || phase === "idle" || phase === "done") return;
    const result = await api<{ ms: number; foul: boolean; slow: boolean; suspicious: boolean; amount: string; ranked: boolean }>(
      `/api/giochi/riflessi/${run.current.id}`,
      { method: "POST", body: {} },
    );
    setPhase("done");
    const why = result.foul ? "Anticipato." : result.suspicious ? "Troppo rapido per essere contato." : result.slow ? "Troppo tardi." : `${result.ms} ms.`;
    setNote(`${why} ${result.ranked ? `In coda: ${result.amount} $OV.` : "Prova: nessun omaggio."}`);
    await refresh();
  }

  const locked = Boolean(me?.locks.riflessi);
  return (
    <Gate>
      <div className="stack">
        <Panel title="Riflessi">
          <p>Aspetta l'oro. Il tempo è quello del server, non del telefono.</p>
          <ModePick value={locked ? "prova" : mode} locked={locked} onChange={setMode} />
          <div className={`pad ${phase === "go" ? "go" : "wait"}`} style={{ marginTop: 12 }}>
            <div>
              <strong className="pixel">{phase === "go" ? "Ora" : phase === "wait" ? "Aspetta" : "Pronto"}</strong>
              <p>{phase === "idle" ? "Quando parte, il riquadro resta scuro e poi diventa oro." : phase === "go" ? "Tocca." : "Non anticipare."}</p>
            </div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {phase === "idle" || phase === "done" ? <Button onClick={() => void start()}>Inizia</Button> : null}
            {phase === "wait" || phase === "go" ? <Button tone="brick" onClick={() => void tap()}>Tocco</Button> : null}
          </div>
        </Panel>
        {note ? <Banner>{note}</Banner> : null}
      </div>
    </Gate>
  );
}

export function SaltoGame() {
  const { me, refresh } = useSession();
  const [mode, setMode] = useState<Mode>("classifica");
  const [note, setNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const locked = Boolean(me?.locks.salto);

  async function start() {
    setNote(null);
    const begun = await api<{ id: number; seed: string }>("/api/giochi/salto", {
      body: { mode: locked ? "prova" : mode },
    });
    setRunning(true);
    const jumps: number[] = [];
    const state = createJumper(begun.seed);
    let raf = 0;
    let acc = 0;
    let last = performance.now();
    let stopped = false;
    const pressed = { jump: false };
    const onPress = (event: Event) => {
      event.preventDefault();
      pressed.jump = true;
    };
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") onPress(event);
    });
    const canvas = canvasRef.current;
    canvas?.addEventListener("pointerdown", onPress);
    const brick = new Image();
    const hero = new Image();
    brick.src = "/art/brick.png";
    hero.src = "/art/zillo.png";

    const finish = async () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      canvas?.removeEventListener("pointerdown", onPress);
      const result = await api<{ score: number; amount: string; ranked: boolean }>(`/api/giochi/salto/${begun.id}`, {
        body: { jumps },
      });
      setRunning(false);
      setNote(`Punteggio verificato: ${result.score}. ${result.ranked ? `In coda: ${result.amount} $OV.` : "Prova: nessun omaggio."}`);
      await refresh();
    };

    const draw = (current: JumperState) => {
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#140c1c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const unit = 8;
      const ground = 150;
      for (let x = 0; x < 40; x++) ctx.drawImage(brick, x * unit, ground, unit, 16);
      for (const obstacle of current.obstacles) {
        ctx.drawImage(brick, obstacle.x * unit, ground - JUMPER.obH * unit, JUMPER.obW * unit, JUMPER.obH * unit);
      }
      ctx.drawImage(hero, JUMPER.playerX * unit, ground - current.y * unit - 24, 24, 24);
    };

    const loop = (time: number) => {
      acc += time - last;
      last = time;
      while (acc >= JUMPER.tickMs && state.alive) {
        acc -= JUMPER.tickMs;
        const jump = pressed.jump;
        pressed.jump = false;
        if (jump) jumps.push(state.tick);
        stepJumper(state, jump);
      }
      draw(state);
      if (!state.alive) {
        void finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return (
    <Gate>
      <div className="stack">
        <Panel title="Salto di Zillo">
          <p>Tocca lo schermo o premi spazio. Zillo è una moneta con la Z viola, non un personaggio preso da altri giochi.</p>
          <ModePick value={locked ? "prova" : mode} locked={locked} onChange={setMode} />
          <canvas ref={canvasRef} className="play" width={320} height={180} style={{ marginTop: 12 }} />
          <div className="row" style={{ marginTop: 12 }}>
            <Button onClick={() => void start()} disabled={running}>{running ? "In corso" : "Inizia"}</Button>
          </div>
        </Panel>
        {note ? <Banner tone="ok">{note}</Banner> : null}
      </div>
    </Gate>
  );
}

type Question = { id: string; prompt: string; choices: string[] };

export function QuizGame() {
  const { me, refresh } = useSession();
  const [mode, setMode] = useState<Mode>("classifica");
  const [runId, setRunId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);
  const locked = Boolean(me?.locks.quiz);
  const current = questions[index];

  async function start() {
    setNote(null);
    const begun = await api<{ id: number; questions: Question[] }>("/api/giochi/quiz", {
      body: { mode: locked ? "prova" : mode },
    });
    setRunId(begun.id);
    setQuestions(begun.questions);
    setIndex(0);
    setAnswers({});
  }

  async function close() {
    if (!runId) return;
    const payload = questions.map((question) => ({ id: question.id, choice: answers[question.id] ?? -1 }));
    const result = await api<{ score: number; total: number; amount: string; ranked: boolean; corrections: Array<{ id: string; ok: boolean }> }>(
      `/api/giochi/quiz/${runId}`,
      { body: { answers: payload } },
    );
    setRunId(null);
    setQuestions([]);
    setNote(`${result.score}/${result.total} giuste. ${result.ranked ? `In coda: ${result.amount} $OV.` : "Prova: nessun omaggio."}`);
    await refresh();
  }

  return (
    <Gate>
      <div className="stack">
        <Panel title="Quiz ZLang">
          <p>Cinque domande. Le risposte giuste arrivano solo dopo l'invio.</p>
          {!current ? <ModePick value={locked ? "prova" : mode} locked={locked} onChange={setMode} /> : null}
          {current ? (
            <div>
              <p className="pixel" style={{ fontSize: 10 }}>{index + 1}/5</p>
              <p><strong>{current.prompt}</strong></p>
              {current.choices.map((choice, choiceIndex) => (
                <button
                  key={choice}
                  className={`choice ${answers[current.id] === choiceIndex ? "on" : ""}`}
                  onClick={() => setAnswers({ ...answers, [current.id]: choiceIndex })}
                  type="button"
                >
                  {choice}
                </button>
              ))}
              <div className="row">
                {index < questions.length - 1 ? (
                  <Button onClick={() => setIndex(index + 1)} disabled={answers[current.id] === undefined}>Avanti</Button>
                ) : (
                  <Button onClick={() => void close()} disabled={answers[current.id] === undefined}>Chiudi il quiz</Button>
                )}
              </div>
            </div>
          ) : (
            <Button onClick={() => void start()}>Inizia</Button>
          )}
        </Panel>
        {note ? <Banner>{note}</Banner> : null}
      </div>
    </Gate>
  );
}
