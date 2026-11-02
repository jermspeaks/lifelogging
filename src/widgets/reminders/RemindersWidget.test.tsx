import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Reminder } from "@/lib/types";

import { RemindersWidget } from "./RemindersWidget";

const api = vi.hoisted(() => ({
  getDueReminders: vi.fn(),
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  setReminderDone: vi.fn(),
  deleteReminder: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function reminder(
  id: number,
  title: string,
  dueDate: string,
  completedOn: string | null = null,
): Reminder {
  return {
    id,
    title,
    notes: null,
    dueDate,
    dueTime: null,
    completedOn,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getDueReminders.mockResolvedValue([
    reminder(1, "Overdue task", "2026-10-30"),
    reminder(2, "Today task", "2026-10-31"),
    reminder(3, "Finished task", "2026-10-30", "2026-10-31"),
  ]);
  api.createReminder.mockImplementation(async (input) => ({
    ...reminder(4, input.title, input.dueDate),
  }));
  api.updateReminder.mockImplementation(async (id, patch) => ({
    ...reminder(id, "Overdue task", patch.dueDate),
    dueTime: patch.dueTime === "" ? null : (patch.dueTime ?? null),
  }));
  api.setReminderDone.mockResolvedValue(reminder(2, "Today task", "2026-10-31", "2026-10-31"));
});

describe("RemindersWidget", () => {
  it("renders overdue, today, and a collapsed done-today section", async () => {
    wrap(<RemindersWidget today="2026-10-31" />);

    expect(await screen.findByText("Overdue task")).toBeInTheDocument();
    expect(screen.getByText("Overdue · Oct 30")).toBeInTheDocument();
    expect(screen.getByText("Today task")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done today (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/reminders");
  });

  it("quick-adds a reminder for today on Enter", async () => {
    const user = userEvent.setup();
    wrap(<RemindersWidget today="2026-10-31" />);
    const input = await screen.findByRole("textbox", { name: "Add a reminder for today" });

    await user.type(input, "Water the plants{Enter}");

    await waitFor(() =>
      expect(api.createReminder).toHaveBeenCalledWith({
        title: "Water the plants",
        dueDate: "2026-10-31",
      }),
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("snoozes to tomorrow and clears the time", async () => {
    const user = userEvent.setup();
    wrap(<RemindersWidget today="2026-10-31" />);
    await screen.findByText("Overdue task");

    await user.click(screen.getByRole("button", { name: "Snooze Overdue task until tomorrow" }));

    await waitFor(() =>
      expect(api.updateReminder).toHaveBeenCalledWith(1, { dueDate: "2026-11-01", dueTime: "" }),
    );
  });

  it("optimistically toggles done and rolls back when the API rejects", async () => {
    const user = userEvent.setup();
    let rejectMutation!: (error: Error) => void;
    api.setReminderDone.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );
    wrap(<RemindersWidget today="2026-10-31" />);
    await screen.findByText("Today task");
    const checkbox = screen.getByRole("checkbox", { name: "Complete reminder: Today task" });

    await user.click(checkbox);
    await waitFor(() => expect(api.setReminderDone).toHaveBeenCalledWith(2, "2026-10-31", true));
    const checked = await screen.findByRole("checkbox", {
      name: "Uncomplete reminder: Today task",
    });
    expect(checked).toHaveAttribute("aria-checked", "true");
    rejectMutation(new Error("offline"));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Complete reminder: Today task" }),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(api.setReminderDone).toHaveBeenCalledWith(2, "2026-10-31", true);
  });
});
