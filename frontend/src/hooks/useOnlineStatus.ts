import { useEffect, useState } from "react";

/**
 * Whether the browser reports a network connection. `navigator.onLine` can
 * claim "online" on a captive or dead connection, so treat `true` as "maybe";
 * `false` (for example underground) is reliable.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
