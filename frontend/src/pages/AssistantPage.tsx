import { RotateCcw, Sparkles } from "lucide-react";
import { ChatInterface } from "@/components/assistant/ChatInterface";
import { PageHeader } from "@/components/common/PageHeader";
import { useAssistantStore } from "@/store/assistantStore";

/**
 * AI Assistant page — header plus a full-height chat interface.
 * The ChatInterface component handles all API wiring via useAssistant hook.
 *
 * Validates: Requirements 22.1, 23.1
 */
export function AssistantPage() {
  const hasMessages = useAssistantStore((state) => state.messages.length > 0);
  const clearMessages = useAssistantStore((state) => state.clearMessages);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Sparkles />}
        title="MRT Assistant"
        subtitle="Routes, last trains, crowds and station facilities"
        actions={hasMessages && (
          <button
            type="button"
            onClick={clearMessages}
            className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span>New chat</span>
          </button>
        )}
      />
      <div className="min-h-0 flex-1">
        <ChatInterface />
      </div>
    </div>
  );
}
