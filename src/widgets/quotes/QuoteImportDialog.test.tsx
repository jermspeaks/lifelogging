import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuoteImportDialog } from "./QuoteImportDialog";

const api = vi.hoisted(() => ({ importQuotes: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("QuoteImportDialog", () => {
  it("shows imported and skipped result counts", async () => {
    const user = userEvent.setup();
    api.importQuotes.mockResolvedValue({ imported: 12, skipped: 2 });
    wrap(<QuoteImportDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText("Quotes"), "One — Author\nTwo — Author");
    await user.click(screen.getByRole("button", { name: "Import quotes" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Imported 12, skipped 2 duplicates.",
    );
    expect(api.importQuotes).toHaveBeenCalledWith("One — Author\nTwo — Author");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import quotes" })).toBeEnabled(),
    );
  });
});
