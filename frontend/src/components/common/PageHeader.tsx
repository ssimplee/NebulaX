import type { ReactNode } from "react";
import { LINE_COLORS } from "@/data/lineColors";

/** The MRT line colours in network order: the app's signature strip. */
const STRIPE_LINES = ["NS", "EW", "NE", "CC", "DT", "TE"] as const;

/** A thin strip of MRT line colours, like station wayfinding signage. */
export function LineStripe({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-[3px] w-full ${className}`} aria-hidden="true">
      {STRIPE_LINES.map((line) => <span key={line} className="flex-1" style={{ backgroundColor: LINE_COLORS[line] }} />)}
    </div>
  );
}

interface PageHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons or controls on the right. */
  actions?: ReactNode;
}

/** Shared page header: icon tile, title, one-line subtitle and optional actions. */
export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5" aria-hidden="true">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight text-foreground">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <LineStripe />
    </header>
  );
}
