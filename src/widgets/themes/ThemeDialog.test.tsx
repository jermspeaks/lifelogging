import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnualTheme } from "@/lib/types";

import { ThemeDialog } from "./ThemeDialog";

const mutations = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  useSetTheme: () => ({ mutate: mutations.setTheme, isPending: false }),
}));

const theme: AnnualTheme = {
  year: 2025,
  title: "Year of Practice",
  description: "Do the work",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("ThemeDialog", () => {
  it("creates a theme with trimmed fields and an omitted blank description", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ThemeDialog open onOpenChange={onOpenChange} initialYear={2027} allowYearEdit />);

    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2027" } });
    await user.type(screen.getByLabelText("Title"), "  Year of Focus  ");
    await user.type(screen.getByLabelText(/Description/), "   ");
    await user.click(screen.getByRole("button", { name: "Set theme" }));

    await waitFor(() => expect(mutations.setTheme).toHaveBeenCalled());
    expect(mutations.setTheme.mock.calls[0][0]).toEqual({
      year: 2027,
      input: { title: "Year of Focus" },
    });
    act(() => mutations.setTheme.mock.calls[0][1].onSuccess());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("prefills edits and submits the existing year", async () => {
    const user = userEvent.setup();
    render(<ThemeDialog open onOpenChange={() => {}} theme={theme} initialYear={2026} />);

    expect(screen.getByLabelText("Title")).toHaveValue("Year of Practice");
    expect(screen.getByLabelText(/Description/)).toHaveValue("Do the work");
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "  Patience ");
    await user.click(screen.getByRole("button", { name: "Save theme" }));

    await waitFor(() => expect(mutations.setTheme).toHaveBeenCalled());
    expect(mutations.setTheme.mock.calls[0][0]).toEqual({
      year: 2025,
      input: { title: "Patience", description: "Do the work" },
    });
  });

  it("shows client and backend validation errors inline", async () => {
    const user = userEvent.setup();
    render(<ThemeDialog open onOpenChange={() => {}} initialYear={2026} allowYearEdit />);

    await user.click(screen.getByRole("button", { name: "Set theme" }));
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(mutations.setTheme).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Title"), "A theme");
    await user.click(screen.getByRole("button", { name: "Set theme" }));
    act(() => {
      mutations.setTheme.mock.calls[0][1].onError({
        kind: "Validation",
        message: "Rejected by backend",
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Rejected by backend");
  });
});
