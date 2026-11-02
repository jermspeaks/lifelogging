import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { Note } from "@/lib/types";

import { ReviewWidget } from "./ReviewWidget";

vi.mock("@/lib/api", () => ({
  api: {
    getReviewQueue: vi.fn(),
    reviewNote: vi.fn(),
    setNoteArchived: vi.fn(),
  },
  errorMessage: (error: unknown) => String(error),
}));

const first: Note = {
  id: 4,
  title: "Read this again",
  body: "A useful passage.",
  url: null,
  reviewStage: 2,
  nextReviewDate: "2026-11-01",
  lastReviewedOn: "2026-10-28",
  archivedAt: null,
  createdAt: "2026-10-03T09:00:00.000Z",
  updatedAt: "2026-10-03T09:00:00.000Z",
};
const second: Note = { ...first, id: 5, title: "Next note" };

function wrap(today = "2026-11-01") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ReviewWidget today={today} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ReviewWidget", () => {
  it.each(["keep", "snooze"] as const)("records %s and advances the queue", async (action) => {
    let advanced = false;
    vi.mocked(api.getReviewQueue).mockImplementation(async () => ({
      due: advanced ? [second] : [first, second],
      dueCount: advanced ? 1 : 2,
    }));
    vi.mocked(api.reviewNote).mockImplementation(async () => {
      advanced = true;
      return first;
    });
    wrap();

    expect(await screen.findByRole("heading", { name: first.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: action === "keep" ? "Keep" : "Snooze" }));
    await waitFor(() =>
      expect(api.reviewNote).toHaveBeenCalledWith(first.id, "2026-11-01", action),
    );
    expect(await screen.findByRole("heading", { name: second.title })).toBeInTheDocument();
  });

  it("archives with Done and advances to the next note", async () => {
    let advanced = false;
    vi.mocked(api.getReviewQueue).mockImplementation(async () => ({
      due: advanced ? [second] : [first, second],
      dueCount: advanced ? 1 : 2,
    }));
    vi.mocked(api.setNoteArchived).mockImplementation(async () => {
      advanced = true;
      return { ...first, archivedAt: "2026-11-01T10:00:00Z", nextReviewDate: null };
    });
    wrap();

    expect(await screen.findByRole("heading", { name: first.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(api.setNoteArchived).toHaveBeenCalledWith(first.id, true, "2026-11-01"),
    );
    expect(await screen.findByRole("heading", { name: second.title })).toBeInTheDocument();
  });

  it("shows the empty state and manage link", async () => {
    vi.mocked(api.getReviewQueue).mockResolvedValue({ due: [], dueCount: 0 });
    wrap();
    expect(await screen.findByText("Nothing to review today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Save a note" })).toHaveAttribute("href", "/notes");
  });
});
