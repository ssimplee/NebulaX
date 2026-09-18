import { createContext, useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useJourneyMonitor } from "./useJourneyMonitor";
import { notificationKey, useRachelStore } from "./store";

const MonitorContext = createContext({ online: true, loading: false, error: null as string | null });
export const useRachelStatus = () => useContext(MonitorContext);

export function RachelShell({ children }: { children: ReactNode }) {
  const status = useJourneyMonitor();
  const { pathname } = useLocation();
  const { snapshot, inbox, saved, dismiss } = useRachelStore();
  const key = snapshot ? notificationKey(snapshot) : "";
  const pending = inbox.find((n) => n.key === key && !n.read && !n.dismissed);
  return (
    <MonitorContext.Provider value={status}>
      <div className="flex h-full min-h-0 flex-col">
        {!pathname.startsWith("/journey") && saved && snapshot?.recommendation.shouldNotify && pending && (
          <aside aria-label="Morning journey notification" role="status" className="flex items-center gap-3 border-b border-orange-300 bg-orange-50 p-3 text-slate-900">
            <Link to="/journey" className="min-h-11 flex-1 font-semibold underline underline-offset-4">
              {snapshot.mode === "demo" ? "Demo replay: " : "Journey update: "}{pending.action}
            </Link>
            <button onClick={() => dismiss(key)} className="min-h-11 px-3 font-medium" aria-label="Dismiss journey notification">Dismiss</button>
          </aside>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </MonitorContext.Provider>
  );
}
