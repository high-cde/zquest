/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer: number;
};

export const QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "ov-rete",
    prompt: "Su quale rete vive il gettone di comunità $OV (VELVET)?",
    choices: ["Bitcoin", "Solana", "Polygon", "Una rete privata di ZQuest"],
    answer: 1,
  },
  {
    id: "ov-decimali",
    prompt: "Quanti decimali ha il mint $OV letto on-chain?",
    choices: ["0", "6", "9", "18"],
    answer: 1,
  },
  {
    id: "dsn-standard",
    prompt: "$DSN (NETkali) è…",
    choices: ["un NFT", "un gettone SPL", "un ERC-20 su Polygon", "una banconota"],
    answer: 2,
  },
  {
    id: "gratis",
    prompt: "Per fare check-in o giocare si paga qualcosa?",
    choices: ["Sì, una puntata in $OV", "Solo il primo giorno", "No: l'ingresso è gratuito", "Solo gli incontri"],
    answer: 2,
  },
  {
    id: "tabella",
    prompt: "Il premio del check-in come viene scelto?",
    choices: [
      "Con una tabella di probabilità pubblica",
      "Da chi ha più follower",
      "È garantito ogni giorno",
      "In base al prezzo del gettone",
    ],
    answer: 0,
  },
  {
    id: "nox",
    prompt: "I like, i repost o i follow su X danno premi $DSN?",
    choices: ["Sì, un like vale un gettone", "Solo i repost", "No, nessuna quest per quelle azioni", "Solo se citi ZQuest"],
    answer: 2,
  },
  {
    id: "dry",
    prompt: "Con REWARDS_LIVE disattivato, un premio approvato…",
    choices: [
      "viene inviato subito",
      "resta contabilizzato in prova, senza transazione",
      "cancella l'account",
      "apre una puntata",
    ],
    answer: 1,
  },
  {
    id: "sec",
    prompt: "In ZLang, SEC vuol dire…",
    choices: ["un secondo premio", "una giornata senza omaggio", "un account segreto", "una vendita"],
    answer: 1,
  },
  {
    id: "zlang-nox",
    prompt: "In ZLang, NOX vuol dire…",
    choices: ["un bonus notturno", "niente premi per azioni su X", "un invito illimitato", "un prestito"],
    answer: 1,
  },
  {
    id: "incontri",
    prompt: "Gli incontri nel bot Red Velvet…",
    choices: [
      "pagano in $OV",
      "sono aperti ai minori",
      "sono 18+ in beta, senza gettoni e senza pagamenti",
      "verificano un documento in automatico",
    ],
    answer: 2,
  },
  {
    id: "salto",
    prompt: "Il salto di Zillo cosa misura?",
    choices: [
      "un numero casuale",
      "il punteggio verificato dal server",
      "quanto hai pagato",
      "il tempo in cui tieni aperta la pagina",
    ],
    answer: 1,
  },
  {
    id: "inviti",
    prompt: "Gli inviti accettati…",
    choices: ["sono illimitati", "hanno un tetto per persona", "premiano i follow", "collegano da soli il portafoglio"],
    answer: 1,
  },
  {
    id: "zswap",
    prompt: "ZSwap, rispetto a ZQuest, è…",
    choices: [
      "uno scambio eseguito da questo server",
      "il sito statico collegato; la quest è la guida in sola lettura",
      "obbligatorio per il check-in",
      "una promessa di prezzo",
    ],
    answer: 1,
  },
  {
    id: "incasso",
    prompt: "Per mettere in coda un omaggio $OV verso un indirizzo serve…",
    choices: [
      "solo il nome Telegram",
      "un portafoglio Solana firmato, poi l'approvazione di chi amministra",
      "una carta di pagamento",
      "il profilo incontri",
    ],
    answer: 1,
  },
  {
    id: "eta",
    prompt: "L'autodichiarazione dei 18 anni…",
    choices: [
      "è un controllo del documento",
      "non è una verifica dell'età",
      "sblocca anche i premi in gettoni",
      "è facoltativa per gli incontri",
    ],
    answer: 1,
  },
];

export function publicQuestion(question: QuizQuestion): { id: string; prompt: string; choices: string[] } {
  return { id: question.id, prompt: question.prompt, choices: question.choices };
}

export function pickQuestions(intRng: (max: number) => number, count = 5): QuizQuestion[] {
  const pool = [...QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = intRng(i + 1);
    const swap = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = swap;
  }
  return pool.slice(0, count);
}

export function scoreAnswers(
  questions: QuizQuestion[],
  answers: Array<{ id: string; choice: number }>,
): { score: number; corrections: Array<{ id: string; ok: boolean; answer: number }> } {
  if (answers.length !== questions.length) throw new Error("risposte incomplete");
  const byId = new Map(questions.map((question) => [question.id, question]));
  let score = 0;
  const corrections = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const question = byId.get(answer.id);
    if (!question || seen.has(answer.id)) throw new Error("risposta non valida");
    seen.add(answer.id);
    const ok = answer.choice === question.answer;
    if (ok) score += 1;
    corrections.push({ id: question.id, ok, answer: question.answer });
  }
  if (seen.size !== questions.length) throw new Error("risposte incomplete");
  return { score, corrections };
}
