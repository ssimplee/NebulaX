import { useEffect, useState } from "react";
import { fetchJourneyImpact } from "./api";
import { useRachelStore } from "./store";

export function useConnection() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/** Mounted in the app shell so a saved journey can update on any app page. */
export function useJourneyMonitor() {
  const { mode, saved, routine, applySnapshot } = useRachelStore();
  const online = useConnection();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (mode !== "live" || !saved || !online) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      controller = new AbortController();
      setLoading(true);
      try {
        const snapshot = await fetchJourneyImpact(routine, controller.signal);
        if (!stopped) { applySnapshot(snapshot); setError(null); }
      } catch {
        if (!stopped) setError("Journey updates are unavailable. Any saved advice may be out of date.");
      } finally {
        if (!stopped) { setLoading(false); timer = setTimeout(update, 60_000); }
      }
    };
    void update();
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); };
  }, [mode, saved, routine, online, applySnapshot]);
  return { online, loading, error: mode === "live" && saved ? error : null };
}
