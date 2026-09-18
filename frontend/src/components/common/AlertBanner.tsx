import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, Info, X } from "lucide-react";
import { useServiceAlerts } from "@/features/alerts/useServiceAlerts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataSourceLabel } from "./DataSourceLabel";
import type { ServiceAlert } from "@/services/alerts.api";

/**
 * Network-wide train service alerts, in two presentations that never push the
 * page around:
 *  - ServiceAlertsButton: a small button over the map that opens the details
 *  - AlertBanner: a one-line strip on scrolling pages that expands on request
 *
 * Both render nothing when service is normal or the feed is unavailable.
 * Major disruptions are styled red and minor delays amber.
 */

/** Identity for a set of alerts, so dismissal resets when the alerts change. */
function alertsSignature(alerts: ServiceAlert[]): string {
  return alerts.map((a) => `${a.lineCode}:${a.status}:${a.createdAt}`).join("|");
}

function useAlertSummary() {
  const { data } = useServiceAlerts();
  const alerts = data?.alerts ?? [];
  return {
    alerts,
    source: data?.source,
    retrievedAt: data?.retrievedAt,
    hasMajor: alerts.some((a) => a.severity === "major"),
  };
}

function AlertList({ alerts }: { alerts: ServiceAlert[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1.5">
      {alerts.map((alert) => (
        <li key={`${alert.lineCode}-${alert.createdAt}`}>
          <span className="font-medium">{alert.lineCode}</span>
          {alert.direction && alert.direction !== "Both" && (
            <span> · {t("alerts.towards", { direction: alert.direction })}</span>
          )}
          <span> — {alert.message}</span>
          {alert.freePublicBusStationIds.length > 0 && (
            <span className="block opacity-80">
              {t("alerts.freeBus", { count: alert.freePublicBusStationIds.length })}
            </span>
          )}
          {alert.freeMrtShuttleStationIds.length > 0 && (
            <span className="block opacity-80">
              {t("alerts.freeShuttle", { count: alert.freeMrtShuttleStationIds.length })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const toneClasses = (major: boolean) =>
  major ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800";

/**
 * Compact alert button for overlaying the map: one tap opens the details in a
 * popover, and the map, search bar and view switch never move.
 */
export function ServiceAlertsButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { alerts, source, retrievedAt, hasMajor } = useAlertSummary();
  if (alerts.length === 0) return null;
  const Icon = hasMajor ? AlertTriangle : Info;
  const title = hasMajor ? t("alerts.majorTitle") : t("alerts.minorTitle");

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${title}: ${t("alerts.count", { count: alerts.length })}. ${t("alerts.show")}`}
        className={`flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2.5 text-sm font-bold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClasses(hasMajor)} ${className}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span aria-hidden="true">{alerts.length}</span>
      </PopoverTrigger>
      {/* The map's controls sit at z-[700]; keep the details above them. */}
      <PopoverContent
        align="end"
        sideOffset={6}
        className={`z-[1000] w-[min(24rem,calc(100vw-1.5rem))] border p-3 text-xs ${toneClasses(hasMajor)}`}
      >
        <div className="mb-2 flex items-center gap-2">
          <Icon size={16} aria-hidden="true" />
          <span className="font-semibold">{title}</span>
          {source && <DataSourceLabel source={source} updatedAt={retrievedAt} />}
        </div>
        <AlertList alerts={alerts} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * One-line alert strip for scrolling pages. It shows the headline and count,
 * expands to the full list on request, and can be dismissed until the alerts change.
 */
export function AlertBanner() {
  const { t } = useTranslation();
  const { alerts, source, retrievedAt, hasMajor } = useAlertSummary();
  const [expanded, setExpanded] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);

  if (alerts.length === 0) return null;
  const signature = alertsSignature(alerts);
  if (signature === dismissedSignature) return null;

  const Icon = hasMajor ? AlertTriangle : Info;

  return (
    <div role="status" aria-live="polite" className={`relative z-50 border-b px-3 text-xs ${toneClasses(hasMajor)}`}>
      <div className="flex min-h-9 items-center gap-2">
        <Icon size={16} className="shrink-0" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold">{hasMajor ? t("alerts.majorTitle") : t("alerts.minorTitle")}</span>
            {" · "}{t("alerts.count", { count: alerts.length })}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5 font-semibold">
            {expanded ? t("alerts.hide") : t("alerts.show")}
            <ChevronDown size={14} className={expanded ? "rotate-180" : ""} aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setDismissedSignature(signature)}
          aria-label={t("alerts.dismiss")}
          className="grid size-9 shrink-0 place-items-center rounded opacity-60 hover:opacity-100"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div className="pb-2 pl-6">
          {source && <div className="mb-1.5"><DataSourceLabel source={source} updatedAt={retrievedAt} /></div>}
          <AlertList alerts={alerts} />
        </div>
      )}
    </div>
  );
}
