import { Bot, User } from "lucide-react";
import type { ChatMessage, RouteWizardStep } from "@/types/assistant.types";
import { cn } from "@/lib/utils";
import { ActionCard } from "./ActionCard";
import { RouteResultList } from "@/components/route/RouteResultCard";

interface MessageBubbleProps {
  message: ChatMessage;
  /** Only the latest message's quick replies are shown — answered
   *  questions earlier in the history stay as plain text. */
  isLatest?: boolean;
  onQuickReply?: (step: RouteWizardStep, value: string, label: string) => void;
}

/**
 * Chat bubble component with distinct user (right, blue) and assistant (left, grey) styling.
 *
 * Validates: Requirements 22.1, 29.4
 */
export function MessageBubble({
  message,
  isLatest = false,
  onQuickReply,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Bot className="w-4 h-4" aria-hidden="true" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1",
          // Real route results need real width for the summary row and
          // step list — a plain text bubble stays narrow either way.
          message.routeResults?.length ? "max-w-[95%] w-full" : "max-w-[75%]",
          isUser && "items-end"
        )}
      >
        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md shadow-sm shadow-primary/20"
              : "border border-border bg-card text-card-foreground rounded-bl-md shadow-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.warning && (
            <p className="mt-1 text-xs font-medium opacity-80">
              ⚠️ {message.warning}
            </p>
          )}
        </div>

        {/* Real computed route(s) from the agentic assistant's plan_route tool */}
        {!isUser && message.routeResults?.length && (
          <div className="w-full">
            <RouteResultList routes={message.routeResults} />
          </div>
        )}

        {/* Action card for structured responses */}
        {!isUser &&
          !message.suppressActionCard &&
          (message.stationIds?.length || message.uiAction) && (
            <ActionCard message={message} />
          )}

        {/* Quick-reply chips for the route-planning follow-up wizard */}
        {!isUser && isLatest && message.quickReplies && message.wizardStep && (
          <div className="flex flex-wrap gap-2">
            {message.quickReplies.map((reply) => (
              <button
                key={reply.value}
                type="button"
                onClick={() =>
                  onQuickReply?.(message.wizardStep!, reply.value, reply.label)
                }
                className="min-h-9 rounded-full border border-primary/30 bg-card px-3.5 py-1.5 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {reply.label}
              </button>
            ))}
          </div>
        )}

        {/* Data freshness indicator */}
        {!isUser && message.dataFreshness && (
          <span className="text-xs text-muted-foreground px-1">
            Data as of{" "}
            {new Date(message.dataFreshness).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
