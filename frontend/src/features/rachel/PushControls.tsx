import { useState } from "react";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentPushState, disableWebPush, enableWebPush, sendTestPush, type PushState } from "./webPush";

export function PushControls() {
  const { t } = useTranslation();
  const [state, setState] = useState<PushState>(() => currentPushState());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (operation: "enable" | "disable" | "test") => {
    setBusy(true); setMessage("");
    try {
      if (operation === "enable") await enableWebPush();
      if (operation === "disable") await disableWebPush();
      if (operation === "test") await sendTestPush();
      setState(currentPushState());
      setMessage(t(`rachel.push.${operation}Success`));
    } catch (error) {
      setState(currentPushState());
      const reason = error instanceof Error ? error.message : "failed";
      setMessage(t(reason === "blocked" ? "rachel.push.blocked" : "rachel.push.failed"));
    } finally { setBusy(false); }
  };

  return (
    <section className="rachel-panel" aria-labelledby="push-title">
      <div className="rachel-section-heading"><h2 id="push-title"><BellRing size={20} aria-hidden="true" /> {t("rachel.push.title")}</h2><span className="rachel-tag">{t(`rachel.push.status.${state}`)}</span></div>
      <p className="rachel-muted">{t("rachel.push.description")}</p>
      <div className="rachel-inbox-actions">
        {state === "off" && <button className="rachel-button" disabled={busy} onClick={() => void run("enable")}>{t("rachel.push.enable")}</button>}
        {state === "on" && <><button className="rachel-button" disabled={busy} onClick={() => void run("test")}>{t("rachel.push.test")}</button><button className="rachel-button rachel-button-secondary" disabled={busy} onClick={() => void run("disable")}>{t("rachel.push.disable")}</button></>}
      </div>
      {message && <p role="status" className="rachel-small">{message}</p>}
    </section>
  );
}

