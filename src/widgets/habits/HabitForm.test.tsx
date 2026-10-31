import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Habit } from "@/lib/types";

import { HabitForm } from "./HabitForm";

const api = vi.hoisted(() => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const habit: Habit = {
  id: 7,
  name: "Read",
  description: "20 minutes",
  color: "blue",
  scheduleDays: 31,
  sortOrder: 1,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HabitForm", () => {
  it("blocks an empty (or whitespace-only) name", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    wrap(<HabitForm onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Create habit" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create habit" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");

    expect(api.createHabit).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("blocks an empty schedule", async () => {
    const user = userEvent.setup();
    wrap(<HabitForm habit={{ ...habit, scheduleDays: 1 }} onDone={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Monday" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Pick at least one day")).toBeInTheDocument();
    expect(api.updateHabit).not.toHaveBeenCalled();
  });

  it("creates with trimmed values and defaults", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    api.createHabit.mockResolvedValue({ ...habit, id: 99 });
    wrap(<HabitForm onDone={onDone} />);

    await user.type(screen.getByLabelText("Name"), "  Stretch  ");
    await user.click(screen.getByRole("radio", { name: "Green" }));
    await user.click(screen.getByRole("button", { name: "Weekdays" }));
    await user.click(screen.getByRole("button", { name: "Create habit" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.createHabit).toHaveBeenCalledWith({
      name: "Stretch",
      color: "green",
      scheduleDays: 31,
    });
  });

  it("prefills when editing and sends a patch ('' clears the description)", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    api.updateHabit.mockResolvedValue(habit);
    wrap(<HabitForm habit={habit} onDone={onDone} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Read");
    expect(screen.getByRole("radio", { name: "Blue" })).toHaveAttribute("aria-checked", "true");
    await user.clear(screen.getByLabelText(/Description/));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.updateHabit).toHaveBeenCalledWith(7, {
      name: "Read",
      description: "",
      color: "blue",
      scheduleDays: 31,
    });
  });

  it("shows backend Validation errors inline and stays open", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    api.createHabit.mockRejectedValue({ kind: "Validation", message: "Name already taken" });
    wrap(<HabitForm onDone={onDone} />);

    await user.type(screen.getByLabelText("Name"), "Read");
    await user.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name already taken");
    expect(onDone).not.toHaveBeenCalled();
  });
});
