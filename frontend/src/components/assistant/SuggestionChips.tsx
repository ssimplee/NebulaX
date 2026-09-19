import { Accessibility, Bot, Building2, Clock, Navigation, TriangleAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

const SUGGESTIONS: ReadonlyArray<{ topic: string; text: string; icon: LucideIcon }> = [
  { topic: "Plan a route", text: "How to get to Orchard?", icon: Navigation },
  { topic: "Crowd levels", text: "Is it crowded at Raffles Place?", icon: Users },
  { topic: "Last trains", text: "Last train from Jurong East?", icon: Clock },
  { topic: "Accessibility", text: "Wheelchair accessible route to Changi?", icon: Accessibility },
  { topic: "Service alerts", text: "Any incidents on the East-West line?", icon: TriangleAlert },
  { topic: "Station facilities", text: "Facilities at Bishan station?", icon: Building2 },
];

/**
 * Empty-chat welcome: a short greeting and one card per thing the assistant
 * can do. Tapping a card asks that question.
 *
 * Validates: Requirements 22.1, 29.4
 */
export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-1 py-6 md:py-10">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 animate-in fade-in zoom-in-90 duration-300 motion-reduce:animate-none" aria-hidden="true">
        <Bot className="size-7" />
      </div>
      <h2 className="mt-4 text-center text-xl font-bold text-foreground md:text-2xl">Where are you heading today?</h2>
      <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
        Ask me about Singapore MRT
      </p>

      <ul className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Suggested questions">
        {SUGGESTIONS.map(({ topic, text, icon: Icon }, index) => (
          <li
            key={text}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none"
            style={{ animationDelay: `${60 + index * 45}ms` }}
          >
            <button
              type="button"
              onClick={() => onSelect(text)}
              className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{topic}</span>
                <span className="block text-sm font-semibold text-foreground">{text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
