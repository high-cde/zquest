/* Copyright (c) 2026 ZDOS1.3 — P.IVA 11040550961. Tutti i diritti riservati. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setSessionToken, type Me, type PublicInfo } from "./api";

type SessionValue = {
  pub: PublicInfo | null;
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [pub, setPub] = useState<PublicInfo | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    try {
      const info = await api<PublicInfo>("/api/pubblico");
      setPub(info);
      const webApp = window.Telegram?.WebApp;
      if (webApp?.initData && !localStorage.getItem("zquest.token")) {
        webApp.ready();
        webApp.expand();
        const entered = await api<{ token: string; user: Me }>("/api/telegram", { body: { initData: webApp.initData } });
        setSessionToken(entered.token);
        setMe(entered.user);
        return;
      }
      if (localStorage.getItem("zquest.token")) setMe(await api<Me>("/api/me"));
      else setMe(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Errore di caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return <SessionContext.Provider value={{ pub, me, loading, error, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("sessione");
  return value;
}

export function Sprite({ name, size = 32, alt }: { name: string; size?: number; alt: string }) {
  return <img className="sprite" src={`/art/${name}.png`} width={size} height={size} alt={alt} />;
}

export function Panel({ title, children, tone }: { title?: string; children: ReactNode; tone?: "brick" | "quiet" }) {
  return (
    <section className={`panel ${tone ?? ""}`}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function Banner({ children, tone }: { children: ReactNode; tone?: "bad" | "ok" }) {
  return <div className={`banner ${tone ?? ""}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  disabled,
  tone,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "brick" | "ghost";
  type?: "button" | "submit";
}) {
  return (
    <button className={`btn ${tone ?? ""}`} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Gate({ children }: { children: ReactNode }) {
  const { me, pub, refresh } = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (me) return <>{children}</>;
  return (
    <Panel title="Entra">
      <p>Da Telegram la mini-app ti riconosce da sola. Qui, se la dimostrazione è accesa, puoi guardare il servizio senza un bot.</p>
      {pub?.allowDemo ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage(null);
            try {
              const entered = await api<{ token: string }>("/api/demo/entra", { body: { name } });
              setSessionToken(entered.token);
              await refresh();
            } catch (caught) {
              setMessage(caught instanceof Error ? caught.message : "Ingresso non riuscito.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Nome in classifica</span>
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={16} required placeholder="es. mattonella" />
          </label>
          <Button type="submit" disabled={busy}>{busy ? "Entro…" : "Entra in dimostrazione"}</Button>
        </form>
      ) : (
        <p>L'ingresso dimostrativo è spento. Apri ZQuest dal bot @RedVelvetOfficial_bot.</p>
      )}
      {message ? <p className="bad">{message}</p> : null}
    </Panel>
  );
}
