import { useState, useRef, useEffect } from "react";
import { Bot, Send } from "lucide-react";
import { useAssistant } from "@/features/assistant/useAssistant";
import { MessageBubble } from "./MessageBubble";
import { SuggestionChips } from "./SuggestionChips";

/** Three bouncing dots while the assistant works; a static ellipsis with reduced motion. */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 animate-in fade-in duration-200 motion-reduce:animate-none" role="status">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
        <Bot className="size-4" />
      </div>
      <div className="flex h-10 items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-4 shadow-sm">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-2 rounded-full bg-muted-foreground/70 animate-bounce motion-reduce:animate-none"
            style={{ animationDelay: `${dot * 140}ms` }}
            aria-hidden="true"
          />
        ))}
        <span className="sr-only">Thinking...</span>
      </div>
    </div>
  );
}

/**
 * Main AI chat container with message list, input field, suggestion chips,
 * and loading indicator. Messages sit in a centred reading column on wide screens.
 *
 * Validates: Requirements 22.1, 23.1, 29.4
 */
export function ChatInterface() {
  const { messages, isLoading, send, answerQuickReply } = useAssistant();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEmpty = messages.length === 0;

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    send(trimmed);
    setInput("");
  };

  const handleSuggestionSelect = (text: string) => {
    send(text);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {isEmpty ? (
            <SuggestionChips onSelect={handleSuggestionSelect} />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                  onQuickReply={answerQuickReply}
                />
              ))}

              {isLoading && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card/95 px-4 pb-3 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about MRT routes, timings, or stations..."
            disabled={isLoading}
            className="h-12 flex-1 rounded-2xl border border-input bg-background px-4 text-[15px] shadow-sm transition-shadow placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-60"
            aria-label="Chat message input"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            aria-label="Send message"
          >
            <Send className="size-5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
