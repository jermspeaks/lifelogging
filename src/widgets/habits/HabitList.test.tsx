import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Habit } from "@/lib/types";

import { ArchivedHabits, HabitList } from "./HabitList";

const api = vi.hoisted(() => ({
  deleteHabit: vi.fn(),
  unarchiveHabit: vi.fn(),
  archiveHabit: vi.fn(),
  reorderHabits: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeHabit(id: number, name: string, archived = false): Habit {
  return {
    id,
    name,
    description: null,
    color: "slate",
    scheduleDays: 127,
    sortOrder: id,
    archivedAt: archived ? "2026-10-20T00:00:00Z" : null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteHabit.mockResolvedValue(undefined);
  api.reorderHabits.mockResolvedValue(undefined);
});

describe("ArchivedHabits", () => {
  it("calls deleteHabit only after the confirmation", async () => {
    const user = userEvent.setup();
    wrap(<ArchivedHabits habits={[makeHabit(3, "Floss", true)]} />);

    await user.click(screen.getByRole("button", { name: /Archived \(1\)/ }));
    await user.click(screen.getByRole("button", { name: "Delete Floss" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete Floss and all its history?");
    expect(api.deleteHabit).not.toHaveBeenCalled();

    // Cancelling does nothing.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.deleteHabit).not.toHaveBeenCalled();

    // Confirming deletes.
    await user.click(screen.getByRole("button", { name: "Delete Floss" }));
    await user.click(await screen.findByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(api.deleteHabit).toHaveBeenCalledTimes(1));
    expect(api.deleteHabit.mock.calls[0][0]).toBe(3);
  });
});

describe("HabitList", () => {
  it("reorders with the full ordered list of active ids", async () => {
    const user = userEvent.setup();
    const habits = [makeHabit(1, "Read"), makeHabit(2, "Run"), makeHabit(5, "Write")];
    wrap(<HabitList habits={habits} onEdit={() => {}} />);

    expect(screen.getByRole("button", { name: "Move Read up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Write down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move Read down" }));
    await waitFor(() => expect(api.reorderHabits).toHaveBeenCalled());
    expect(api.reorderHabits.mock.calls[0][0]).toEqual([2, 1, 5]);
  });
});
