import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { api } from "@/lib/api";

import { JournalWidget } from "./JournalWidget";

vi.mock("@/lib/api", () => ({
  api: {
    getJournalEntry: vi.fn(),
    saveJournalEntry: vi.fn(),
    listJournalEntries: vi.fn(),
    deleteJournalEntry: vi.fn(),
  },
  errorMessage: (error: unknown) => String(error),
}));

function renderWidget(today: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <JournalWidget today={today} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.mocked(api.getJournalEntry).mockReset().mockResolvedValue(null);
  vi.mocked(api.saveJournalEntry)
    .mockReset()
    .mockImplementation(async (date, _today, body) => ({
      date,
      body,
      wordCount: body.trim() ? body.trim().split(/\s+/u).length : 0,
      createdAt: `${date}T12:00:00Z`,
      updatedAt: `${date}T12:00:00Z`,
    }));
});

describe("Today journal widget", () => {
  it("debounces edits for one second and shows the saved status", async () => {
    renderWidget("2026-10-30");
    const editor = await screen.findByRole("textbox", { name: "Journal entry for 2026-10-30" });
    await waitFor(() => expect(editor).toBeEnabled());
    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: "A quick note" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(api.saveJournalEntry).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();
    await waitFor(() =>
      expect(api.saveJournalEntry).toHaveBeenCalledWith("2026-10-30", "2026-10-30", "A quick note"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/^Saved /);
  });

  it("flushes the old date's pending text when today rolls over", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JournalWidget today="2026-10-30" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const editor = await screen.findByRole("textbox", { name: "Journal entry for 2026-10-30" });
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.change(editor, { target: { value: "Saved on the day it was written" } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <JournalWidget today="2026-10-31" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(api.saveJournalEntry).toHaveBeenCalledWith(
        "2026-10-30",
        "2026-10-30",
        "Saved on the day it was written",
      ),
    );
    expect(
      await screen.findByRole("textbox", { name: "Journal entry for 2026-10-31" }),
    ).toHaveValue("");
  });

  it("saves on blur and offers retry after a failure", async () => {
    vi.mocked(api.saveJournalEntry).mockRejectedValueOnce(new Error("offline"));
    renderWidget("2026-10-30");
    const editor = await screen.findByRole("textbox", { name: "Journal entry for 2026-10-30" });
    await waitFor(() => expect(editor).toBeEnabled());
    fireEvent.change(editor, { target: { value: "Retry me" } });
    fireEvent.blur(editor);
    expect(await screen.findByRole("alert")).toHaveTextContent("offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.saveJournalEntry).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("status")).toHaveTextContent(/^Saved /);
  });
});
