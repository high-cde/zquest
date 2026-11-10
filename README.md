# ZQuest

Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati.

Software proprietario. Senza autorizzazione scritta di ZDOS1.3 è vietato copiare, modificare, distribuire o creare opere derivate. È fornito così com'è, senza garanzie. Non è consulenza finanziaria. Si applica la legge italiana. Vedi il file `LICENSE`.

Registro di omaggi, giochi di abilità e attività della comunità ZDOS e Red Velvet. L'interfaccia è in italiano. I gettoni **$OV** (VELVET, Solana) e **$DSN** (NETkali, Polygon) sono valute di comunità: non sono un investimento e questo servizio non promette un guadagno.

Check-in e giochi sono gratuiti. Non si punta nulla e non si paga per partecipare. Non è un gioco con licenza ADM, perché non c'è una posta.

Il compagno statico è [ZSwap](https://swap.x-zdos.it). ZQuest non esegue scambi.

## Cosa fa, in breve

- Check-in giornaliero con tabella di probabilità pubblica, serie di giorni e tetti.
- Tre giochi di abilità: riflessi, salto di Zillo, quiz ZLang. Classifica settimanale.
- Coda premi. L'invio on-chain parte solo dopo un'approvazione e solo se `REWARDS_LIVE=true`.
- Quest $DSN per attività verificabili. Nessuna quest per like, repost o follow.
- Bozze di testo per X, con link `https://x.com/intent/post`. Nessun autopost.
- Incontri 18+ in beta, separati dai premi: niente gettoni e niente pagamenti.
- Bot Telegram spento di default, per non aprire un secondo `getUpdates` su `@RedVelvetOfficial_bot`.

## Regole

Il giorno è quello UTC.

**Check-in.** Una volta al giorno il server estrae un intero uniforme da 0 a 9999.

| Esito | Probabilità | Numeri | Omaggio |
| --- | --- | --- | --- |
| Nessun omaggio (SEC) | 60% | 0–5999 | 0 $OV |
| Scintilla | 25% | 6000–8499 | 5 $OV |
| Mattone | 10% | 8500–9499 | 20 $OV |
| Stella | 4% | 9500–9899 | 80 $OV |
| Zecca d'oro | 1% | 9900–9999 | 200 $OV |

Ogni 7 giorni di fila c'è un bonus fisso di 10 $OV, non casuale.

**Tetti di default**, in gettoni interi, modificabili nel `.env`:

| | Tetto personale / giorno | Tetto di comunità / giorno | Budget iniziale |
| --- | --- | --- | --- |
| $OV | 500 | 10.000 | 100.000 |
| $DSN | 40 | 400 | 2.000 |

Se un tetto o il budget non bastano, l'estrazione resta visibile e l'omaggio diventa zero, con il motivo (`cap_utente`, `cap_globale`, `budget`).

**Riflessi.** Il tempo è misurato dal server. Anticipare è un fallo. Sotto gli 80 ms il colpo è scartato. Oltre i 2 secondi è tardi. Altrimenti: fino a 220 ms 12 $OV, fino a 320 ms 6 $OV, fino a 450 ms 2 $OV.

**Salto di Zillo.** Zillo è una moneta originale con la Z viola e due piedi di mattone. Il client manda i momenti dei salti, il server ricalcola la manche. 8 o più mattoni: 3 $OV. 20 o più: 8 $OV. 40 o più: 15 $OV.

**Quiz ZLang.** Cinque domande sulle regole. 3 giuste: 4 $OV. 4 giuste: 8 $OV. 5 giuste: 12 $OV.

La prima manche in classifica del giorno è l'unica che può mettere un omaggio in coda. La prova è libera e non entra in classifica.

Gli omaggi non partono da soli. Entrano in coda. Chi amministra approva un gruppo. Con `REWARDS_LIVE` diverso da `true` l'approvazione resta una prova: il registro segna `dry_run` e non c'è transazione. Un secondo passaggio sulla stessa riga non reinvia.

**Quest $DSN**, una volta per profilo salvo gli inviti:

| Quest | Omaggio | Come si chiude |
| --- | --- | --- |
| Leggi la guida | 2 | Tutte le schede aperte nel servizio |
| Tre giochi in classifica | 3 | Una manche conclusa per gioco |
| Scheda ZSwap | 1 | Lettura della scheda in sola lettura, dentro ZQuest |
| Contributo GitHub | 10 | Link a pull request o issue, accettato da una persona |
| Invito | 2, massimo 5 | Codice usato da un altro profilo che ha già fatto check-in |

Non esistono quest legate a X.

**Incontri, beta, 18+.** Servizio a parte. L'ingresso è un'autodichiarazione di maggiore età più l'accettazione dei termini: non è una verifica del documento. Il profilo è facoltativo, senza foto. Un match nasce solo se entrambe le persone dicono sì. Si può bloccare, segnalare e cancellare. Niente contenuti espliciti: i testi fuori misura vengono rifiutati.

**Anti-sybil.** Un identificativo Telegram, un indirizzo Solana, un indirizzo Polygon. Il collegamento è una firma di messaggio (Sign-In-With-Solana per $OV, `personal_sign` per $DSN), non una transazione. Limiti di frequenza e una manche in classifica al giorno.

## Mini glossario ZLang

ZEL saluto, MAT un giorno di fila, STE un esito poco comune, SEC giornata senza omaggio, OV il gettone su Solana, DSN il gettone su Polygon, QST una quest, NOX niente premi per azioni su X. Non è un listino.

## Gettoni

| | $OV | $DSN |
| --- | --- | --- |
| Nome | VELVET | NETkali |
| Rete | Solana, Token-2022 | Polygon, ERC-20 |
| Indirizzo | `2EN6Y1zM4yyt41gE2muzdJSAgRCAZiXqnmkgpbrspump` | `0xfc90516a1f736FaC557e09D8853dB80dA192c296` |
| Decimali | 6, riletti dal mint all'avvio | 18, riletti dal contratto all'avvio |

$OV è ancora sulla bonding curve di pump.fun. Il programma è Token-2022, senza estensione di transfer fee al momento della lettura. Il portafoglio premi deve avere $OV su un conto token Token-2022 e un po' di SOL per le fee. Su Polygon servono $DSN e un po' di POL per il gas.

Le chiavi private stanno solo nel `.env` del server. Non entrano nel repository, nel frontend o nei log. All'avvio, se la chiave c'è, viene stampato solo l'indirizzo pubblico.

## Privacy, in breve

Il titolare è chi ospita il servizio. Contatto di default: `@RedVelvetOfficial_bot` (`PRIVACY_CONTACT`).

Dati: identificativo Telegram, username, nome scelto, indirizzi collegati, punteggi, check-in, coda premi. Con gli incontri, anche l'autodichiarazione, la bio, i like, i blocchi e le segnalazioni.

Base: esecuzione del servizio chiesto. Per gli incontri, consenso separato.

`/cancella DATI` nel bot, o «Cancella incontri» nell'app, toglie il profilo sociale. `/cancella ACCOUNT CONFERMO`, o «Anonimizza account», toglie anche nome, username e indirizzi e rifiuta gli omaggi ancora in coda. I movimenti di budget restano legati a un id interno, senza quei dati, perché altrimenti il conto non torna. Un profilo che ha dichiarato meno di 18 anni tiene quel blocco tecnico.

## Avvertenza

Le operazioni a premio in Italia, e il loro trattamento fiscale, possono richiedere adempimenti (regolamento, cauzione, aspetti tributari). Questo software non è un parere. Prima di impostare `REWARDS_LIVE=true` fai revisionare il progetto da un professionista.

ZQuest non è affiliato a X, a SpaceX o a persone o aziende omonime. I testi per X sono bozze: li pubblica un essere umano.

## Avvio in locale

Serve Node.js 22 o successivo.

```bash
npm ci
cp .env.example .env
# in locale puoi mettere ALLOW_DEMO=true, SEED_DEMO=true, NODE_ENV=development
npm test
npm run build
npm start
```

Il servizio ascolta `127.0.0.1:3200`. La mini-app è la stessa origine, usabile anche come Telegram WebApp.

## Variabili

Sono documentate in `.env.example`. Quelle che contano:

- `BOT_MODE=off|webhook|polling`. Default `off`.
- `REWARDS_LIVE=false` finché chiavi, budget e revisione non ci sono.
- `ALLOW_DEMO=false` in produzione. Acceso, consente un ingresso senza Telegram, utile in locale.
- `ADMIN_TOKEN` protegge `/#/admin` tramite l'header `X-Admin-Token`.
- `SESSION_SECRET` firma le sessioni. In produzione il processo non parte se questi due valori sono ancora `change-me`.

## Bot e VelvetHub

`@RedVelvetOfficial_bot` può essere già in polling da un altro processo. Due `getUpdates` sullo stesso token si rubano i messaggi. Per questo `BOT_MODE` nasce `off` e questo processo non chiama `getUpdates`.

**Se VelvetHub tiene già il bot**, lascia `BOT_MODE=off` e monta il composer nello stesso processo del bot, sullo stesso database:

```js
process.env.ZQUEST_ENV = "/opt/zquest/.env";
import { zquestComposer } from "/opt/zquest/dist/integrate.js";
bot.use(zquestComposer);
```

Il composer risponde solo ai propri comandi (`/start`, `/checkin`, `/giochi`, `/quest`, `/classifica`, `/profilo`, `/incontri`, `/cancella`, `/aiuto`) e non intercetta il resto. I due processi devono poter scrivere lo stesso file SQLite (utente o gruppo in comune, journal WAL già attivo). Non chiamare `setWebhook` da un'altra parte mentre VelvetHub fa polling.

**Se ZQuest è l'unico processo del token**, `BOT_MODE=webhook`, con `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` e `PUBLIC_BASE_URL=https://quest.x-zdos.it`. All'avvio registra `https://quest.x-zdos.it/telegram/webhook`. Non usa `getUpdates`.

`BOT_MODE=polling` va usato solo se nessun altro processo legge quel token. Il log lo dice in modo esplicito.

## Installazione sul VPS

Macchina prevista: Ubuntu su Contabo, nginx e certbot già nello schema. Il servizio systemd si chiama `zquest`, ascolta `127.0.0.1:3200`, il nome pubblico è `https://quest.x-zdos.it`.

Il record DNS non è in questo repository. Il titolare aggiunge:

```text
quest.x-zdos.it.  A  5.189.180.13
```

**Sorgente locale.** Dopo aver estratto l'archivio in `/opt/zquest-src`:

```bash
sudo bash /opt/zquest-src/deploy/install-vps.sh /opt/zquest-src
```

Lo script copia l'albero in `/opt/zquest` (senza `node_modules`, `.env` e database), poi build, systemd e nginx. Un `.env` già presente non viene sovrascritto.

**Repository privato, SSH.** Chiave di deploy in sola lettura sull'utente `zquest`:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin zquest
sudo -u zquest mkdir -p /home/zquest/.ssh
sudo -u zquest ssh-keygen -t ed25519 -f /home/zquest/.ssh/id_ed25519 -N ""
sudo cat /home/zquest/.ssh/id_ed25519.pub
sudo bash deploy/install-vps.sh git@github.com:ORG/zquest.git
```

**Repository privato, HTTPS.** Le credenziali le passa l'operatore nell'URL oppure in variabili, e lo script non le ristampa:

```bash
sudo bash deploy/install-vps.sh 'https://UTENTE:TOKEN@github.com/ORG/zquest.git'
sudo GIT_HTTPS_USER=UTENTE GIT_HTTPS_TOKEN=TOKEN bash deploy/install-vps.sh https://github.com/ORG/zquest.git
```

Non mettere token dentro il repository. `CERTBOT_EMAIL` è facoltativa: se manca, certbot parte con `--register-unsafely-without-email`. Se il DNS non risolve ancora, certbot fallisce e lo script stampa il comando da rilanciare: il servizio HTTP locale resta su.

Dopo il clone, a mano:

1. Controlla il DNS.
2. Compila `.env`: `BOT_TOKEN` solo se questo processo deve parlare con Telegram, indirizzi e chiavi dei due portafogli premi, budget. Lascia `REWARDS_LIVE=false`.
3. Finanzia il portafoglio Solana (SOL + $OV sul Token-2022) e quello Polygon (POL + $DSN).
4. `sudo systemctl restart zquest` e `journalctl -u zquest -n 50`.
5. Entra in `/#/admin` con `ADMIN_TOKEN`, guarda la coda, approva un gruppo piccolo e verifica che lo stato sia `dry_run`.
6. Solo dopo la revisione professionale, e con le chiavi giuste, valuta `REWARDS_LIVE=true`.

`ALLOW_DEMO` in produzione va lasciato `false`.

## Architettura

Un processo Node. Fastify serve l'API e la mini-app compilata. SQLite (better-sqlite3) tiene utenti, check-in, libro mastro, coda, punteggi, quest, incontri e bozze. I vincoli unique e le transazioni `BEGIN IMMEDIATE` impediscono il doppio check-in e la doppia prenotazione. Il libro mastro somma gli importi in JavaScript, perché 18 decimali non stanno in un intero SQLite.

Il budget è un fondo impostato dal `.env` a ogni avvio. Ogni omaggio è una riga `out`. Rifiuto e invio fallito scrivono una riga `back`. La prova (`dry_run`) consuma il budget contabile e non la chain: serve a vedere i tetti prima di accendere gli invii. Cancellare il file sqlite azzera anche quel registro.

La mini-app è React, compilata da Vite, usabile nel browser e come Telegram WebApp. Gli sprite (moneta con la Z, mattone, stella, Zillo) sono pixel originali generati in `scripts/make-sprites.mjs`.

## Test

```bash
npm test
```

Coprono la tabella di probabilità, i tetti, il budget, la serie, il doppio check-in anche concorrente, la coda in dry-run, l'invio simulato una sola volta, il cancello 18+, l'assenza di premi sugli incontri e la firma del portafoglio.

## Licenza

Il codice, gli sprite originali e questa documentazione sono proprietari di ZDOS1.3 (P.IVA 11040550961). In `package.json` il campo è `UNLICENSED`. I font di terze parti IBM Plex Sans e Press Start 2P restano sotto le loro licenze upstream e non diventano parte della licenza di ZQuest. Non ci sono asset Nintendo.
