import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

import { NoteForm } from "./NoteForm";

vi.mock("@/lib/api", () => ({
  api: { createNote: vi.fn(), updateNote: vi.fn() },
  errorMessage: (error: unknown) => String(error),
  isApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "kind" in error && "message" in error,
}));

function wrap(onDone = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NoteForm today="2026-11-01" onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

beforeEach(() => vi.clearAllMocks());

describe("NoteForm", () => {
  it("accepts a pasted URL, uses it as the title, and saves an optional body", async () => {
    const user = userEvent.setup();
    const onDone = wrap();
    vi.mocked(api.createNote).mockResolvedValue({} as never);

    await user.type(screen.getByLabelText("Title or link"), "https://example.test/article");
    await user.click(screen.getByRole("button", { name: "Add a body" }));
    await user.type(screen.getByLabelText("Body (optional)"), "  A passage to remember.  ");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(api.createNote).toHaveBeenCalledWith(
        {
          title: "https://example.test/article",
          url: "https://example.test/article",
          body: "A passage to remember.",
        },
        "2026-11-01",
      ),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("requires a title before sending", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(api.createNote).not.toHaveBeenCalled();
  });

  it("shows an invalid pasted URL error in quick add", async () => {
    const user = userEvent.setup();
    wrap();
    await user.type(screen.getByLabelText("Title or link"), "https://example.test:bad");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByText("Use an absolute http or https URL with a host.")).toBeVisible();
    expect(api.createNote).not.toHaveBeenCalled();
  });
});
