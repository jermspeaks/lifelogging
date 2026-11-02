import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { api } from "@/lib/api";

import JournalPage from "./Journal";

vi.mock("@/lib/date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date")>()),
  useToday: () => "2026-10-31",
}));

vi.mock("@/lib/api", () => ({
  api: {
    getJournalEntry: vi.fn(),
    saveJournalEntry: vi.fn(),
    deleteJournalEntry: vi.fn(),
    listJournalEntries: vi.fn(),
  },
  errorMessage: (error: unknown) => String(error),
}));

function renderJournal(initialEntry = "/journal") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <JournalPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listJournalEntries).mockReset().mockResolvedValue([]);
  vi.mocked(api.getJournalEntry).mockReset().mockResolvedValue(null);
  vi.mocked(api.saveJournalEntry).mockReset();
  vi.mocked(api.deleteJournalEntry).mockReset().mockResolvedValue(undefined);
});

describe("Journal page", () => {
  it("passes the search filter to the list query", async () => {
    vi.mocked(api.listJournalEntries).mockImplementation(async (query) =>
      query
        ? [
            {
              date: "2026-10-29",
              preview: "Found this note",
              wordCount: 3,
              updatedAt: "2026-10-29T12:00:00Z",
            },
          ]
        : [],
    );
    renderJournal();
    const search = screen.getByRole("searchbox", { name: "Search entries" });
    fireEvent.change(search, { target: { value: "found" } });
    expect(await screen.findByText("Found this note")).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listJournalEntries).toHaveBeenCalledWith("found", undefined, 50),
    );
  });

  it("loads the date from the query string and jumps to a selected date", async () => {
    renderJournal("/journal?date=2026-10-30");
    const dateInput = screen.getByLabelText("Entry date");
    expect(dateInput).toHaveValue("2026-10-30");
    await waitFor(() =>
      expect(api.getJournalEntry).toHaveBeenCalledWith("2026-10-30", "2026-10-31"),
    );
    fireEvent.change(dateInput, { target: { value: "2026-10-28" } });
    await waitFor(() =>
      expect(api.getJournalEntry).toHaveBeenCalledWith("2026-10-28", "2026-10-31"),
    );
    expect(dateInput).toHaveValue("2026-10-28");
  });

  it("requires confirmation before deleting an entry", async () => {
    renderJournal("/journal?date=2026-10-30");
    fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(screen.getByText(/permanently removes this journal entry/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Delete entry$/ }));
    await waitFor(() => expect(api.deleteJournalEntry).toHaveBeenCalledWith("2026-10-30"));
  });
});
