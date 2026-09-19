import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useAssistantStore } from "@/store/assistantStore";
import * as assistantApi from "@/services/assistant.api";
import { AssistantPage } from "./AssistantPage";

vi.mock("@/services/assistant.api", () => ({ sendChatMessage: vi.fn() }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><AssistantPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => act(() => useAssistantStore.getState().clearMessages()));

describe("AssistantPage", () => {
  it("has a page header and a welcome with one card per topic", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "MRT Assistant" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where are you heading today?" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /\?$/ })).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "New chat" })).not.toBeInTheDocument();
  });

  it("asks the question on a card, then New chat returns to the welcome", async () => {
    vi.mocked(assistantApi.sendChatMessage).mockResolvedValue({ reply: "Take the NSL.", dataFreshness: null } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /How to get to Orchard\?/ }));
    expect(await screen.findByText("How to get to Orchard?", { selector: "p" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("heading", { name: "Where are you heading today?" })).toBeInTheDocument();
    expect(useAssistantStore.getState().messages).toEqual([]);
  });
});
