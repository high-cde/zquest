/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
export type GuideSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export const GUIDE: readonly GuideSection[] = [
  {
    id: "cos-e",
    title: "Cos'è ZQuest",
    paragraphs: [
      "ZQuest è il registro di omaggi, giochi di abilità e attività della comunità ZDOS e Red Velvet.",
      "I gettoni $OV (VELVET, su Solana) e $DSN (NETkali, su Polygon) sono valute di comunità. Non sono un investimento e questo servizio non promette un guadagno.",
      "Check-in e giochi sono gratuiti. Non si punta nulla e non si paga per partecipare.",
    ],
  },
  {
    id: "premi",
    title: "Tabella e tetti",
    paragraphs: [
      "Il check-in di ogni giorno UTC estrae un numero uniforme da 0 a 9999 e lo legge sulla tabella pubblica: 60% nessun omaggio, 25% Scintilla (5 $OV), 10% Mattone (20 $OV), 4% Stella (80 $OV), 1% Zecca d'oro (200 $OV).",
      "Ogni 7 giorni di fila c'è un omaggio fisso di 10 $OV, non casuale, sempre dentro i tetti.",
      "I tetti giornalieri, personale e di comunità, e il budget del portafoglio premi possono ridurre un premio a zero. Quando succede, il motivo è scritto sul check-in.",
      "Nessun premio lascia il server da solo: entra in coda e serve l'approvazione di chi amministra. Con REWARDS_LIVE disattivato l'approvazione resta una prova, senza transazione.",
    ],
  },
  {
    id: "giochi",
    title: "Giochi di abilità",
    paragraphs: [
      "Riflessi: aspetti il segnale e tocchi. Il tempo è quello del server. Sotto gli 80 ms il colpo è scartato. Anticipare è un fallo. Oltre i 2 secondi è troppo tardi.",
      "Salto di Zillo: la moneta con la Z viola scavalca mattoni. Il server ricalcola i salti, il punteggio che vedi a fine manche è quello verificato.",
      "Quiz ZLang: cinque domande sulle regole, chiuse prima dell'invio. Non è un trivia a pagamento.",
      "La prima manche in classifica del giorno UTC è l'unica che può mettere un omaggio in coda. Le prove libere non premiano e non entrano in classifica.",
    ],
  },
  {
    id: "quest",
    title: "Quest $DSN",
    paragraphs: [
      "Le quest pagano attività verificabili qui o nel bot: leggere la guida, chiudere i tre giochi in classifica, leggere la scheda ZSwap, un contributo GitHub accettato da chi amministra, un invito accettato con tetto.",
      "Non esistono quest per like, repost o follow su X. ZQuest non pubblica da solo su X: prepara bozze e un essere umano decide.",
    ],
  },
  {
    id: "portafoglio",
    title: "Portafoglio",
    paragraphs: [
      "Per ricevere $OV colleghi un indirizzo Solana firmando un messaggio Sign-In-With-Solana. La firma non è una transazione e non muove fondi.",
      "Per ricevere $DSN firmi un messaggio con l'indirizzo Polygon. Un indirizzo per profilo, un profilo per indirizzo.",
      "ZQuest non chiede mai la seed phrase. Se una pagina la chiede, non è questo servizio.",
    ],
  },
  {
    id: "zswap",
    title: "ZSwap in sola lettura",
    paragraphs: [
      "ZSwap è il sito statico compagno, su https://swap.x-zdos.it. ZQuest non esegue scambi e non custodisce fondi per uno swap.",
      "La quest consiste nel leggere questa scheda, non nel dimostrare un like o un pagamento.",
      "Passi, se vuoi guardarci: apri il sito, leggi l'interfaccia, non firmare nulla che non capisci. Puoi chiudere la pagina senza fare operazioni.",
    ],
  },
  {
    id: "incontri",
    title: "Incontri 18+ in beta",
    paragraphs: [
      "Gli incontri sono un servizio a parte, segnato come beta. Non danno gettoni e non accettano pagamenti.",
      "L'ingresso chiede un'autodichiarazione di maggiore età e l'accettazione dei termini. È un'autodichiarazione, non una verifica del documento.",
      "Il profilo è facoltativo, senza foto. Un match nasce solo se entrambe le persone mettono like. Si può bloccare, segnalare e cancellare i dati.",
    ],
  },
  {
    id: "privacy",
    title: "Dati e cancellazione",
    paragraphs: [
      "Il servizio ricorda l'identificativo Telegram, l'username, il nome scelto, gli indirizzi se li colleghi, i punteggi e la coda premi.",
      "Se usi gli incontri, ricorda anche il testo del profilo, i like, i blocchi e le segnalazioni.",
      "Dal profilo o con /cancella DATI nel bot elimini i dati degli incontri. /cancella ACCOUNT rimuove nome, username e indirizzi. Il registro dei movimenti di budget resta legato a un id interno, altrimenti i conti del budget non tornano.",
    ],
  },
  {
    id: "zlang",
    title: "Mini glossario ZLang",
    paragraphs: [
      "ZEL, saluto breve. MAT, un giorno di fila. STE, un esito poco comune. SEC, giornata senza omaggio.",
      "OV, il gettone di comunità su Solana. DSN, il gettone di comunità su Polygon per attività verificabili.",
      "QST, una quest. NOX, niente premi per azioni su X. Non è un listino e non è un linguaggio per muovere fondi.",
    ],
  },
];

export const GUIDE_IDS = GUIDE.map((section) => section.id);
