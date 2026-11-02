import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Quote } from "@/lib/types";

import { QuoteWidget } from "./QuoteWidget";

const api = vi.hoisted(() => ({ getDailyQuote: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const quote: Quote = {
  id: 1,
  text: "Well done is better than well said.",
  author: "Benjamin Franklin",
  source: "Poor Richard's Almanack",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("QuoteWidget", () => {
  it("shows the empty state and a link to the quote collection", async () => {
    api.getDailyQuote.mockResolvedValue(null);
    wrap(<QuoteWidget today="2026-11-01" />);

    expect(await screen.findByText("Add quotes you love")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a quote" })).toHaveAttribute("href", "/quotes");
  });

  it("shows the selected quote with its attribution", async () => {
    api.getDailyQuote.mockResolvedValue(quote);
    wrap(<QuoteWidget today="2026-11-01" />);

    expect(await screen.findByText(`“${quote.text}”`)).toBeInTheDocument();
    expect(screen.getByText(/Benjamin Franklin/)).toHaveTextContent("Poor Richard's Almanack");
    expect(api.getDailyQuote).toHaveBeenCalledWith("2026-11-01");
  });
});
