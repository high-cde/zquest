/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { useEffect, useState } from "react";
import { AdminPage } from "./AdminPage";
import { DatingPage } from "./DatingPage";
import { ExtraMenu, GuidePage, LeaderboardPage, PrivacyPage, RulesPage, WalletPage } from "./Extra";
import { GamesHome, QuizGame, ReflexGame, SaltoGame } from "./Games";
import { Home } from "./Home";
import { QuestPage } from "./QuestPage";
import { Sprite, useSession } from "./ui";

const LINKS = [
  ["/", "Casa", "coin"],
  ["/giochi", "Giochi", "zillo"],
  ["/quest", "Quest", "brick"],
  ["/incontri", "Incontri", "star"],
  ["/altro", "Altro", "coin"],
] as const;

export function App() {
  const path = useHash();
  const { loading, error, pub } = useSession();
  const page = render(path);
  return (
    <>
      <nav className="nav">
        {LINKS.map(([href, label, art]) => (
          <a key={href} href={`#${href}`} className={isActive(path, href) ? "active" : ""}>
            <Sprite name={art} size={16} alt="" />
            {label}
          </a>
        ))}
      </nav>
      <main className="app">
        <header className="top">
          <Sprite name="coin" size={48} alt="Moneta ZQuest" />
          <div className="titles">
            <div className="eyebrow">ZDOS · Red Velvet</div>
            <h1>ZQuest</h1>
            <p className="lede">Omaggi e giochi di abilità. Valute di comunità, non un investimento.</p>
          </div>
        </header>
        {loading ? <p>Carico il registro…</p> : null}
        {error ? <p className="bad">{error}</p> : null}
        {!loading && !error ? page : null}
        <footer className="note">
          <p>Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati.</p>
          <p>
            {pub?.rewardsLive ? "Invii on-chain attivi, solo dopo approvazione." : "Invii in prova: nessuna transazione parte da questa installazione."}
            {" "}<a href="https://swap.x-zdos.it">ZSwap</a>
          </p>
        </footer>
      </main>
    </>
  );
}

function render(path: string) {
  if (path === "/" || path === "") return <Home />;
  if (path === "/giochi") return <GamesHome />;
  if (path === "/giochi/riflessi") return <ReflexGame />;
  if (path === "/giochi/salto") return <SaltoGame />;
  if (path === "/giochi/quiz") return <QuizGame />;
  if (path === "/quest") return <QuestPage />;
  if (path === "/incontri") return <DatingPage />;
  if (path === "/altro") return <ExtraMenu />;
  if (path === "/classifica") return <LeaderboardPage />;
  if (path === "/portafoglio") return <WalletPage />;
  if (path === "/guida") return <GuidePage />;
  if (path.startsWith("/guida/")) return <GuidePage sectionId={path.slice("/guida/".length)} />;
  if (path === "/regole") return <RulesPage />;
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/admin") return <AdminPage />;
  return <Home />;
}

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/" || path === "";
  if (href === "/altro") {
    return ["/altro", "/classifica", "/portafoglio", "/guida", "/regole", "/privacy", "/admin"].some((item) => path === item || path.startsWith(`${item}/`));
  }
  return path === href || path.startsWith(`${href}/`);
}

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}
