import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import { api } from "@/lib/api";
import type { Habit, TodayHabit } from "@/lib/types";

import Today from "./Today";

const TODAY = "2026-10-30"; // a Friday

vi.mock("@/lib/date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date")>()),
  useToday: () => TODAY,
}));

vi.mock("@/lib/api", () => ({
  api: { getToday: vi.fn(), setHabitCheck: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

function habit(id: number, name: string): Habit {
  return {
    id,
    name,
    description: null,
    color: "green",
    scheduleDays: 127,
    sortOrder: id,
    archivedAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

function row(id: number, name: string, scheduledToday: boolean, doneToday: boolean): TodayHabit {
  return {
    habit: habit(id, name),
    scheduledToday,
    doneToday,
    currentStreak: 2,
    last7: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${24 + i}`,
      status: i === 6 ? (doneToday ? "done" : "pending") : "done",
    })),
  };
}

const ROWS: TodayHabit[] = [
  row(1, "Meditate", true, true),
  row(2, "Read", true, false),
  row(3, "Stretch", true, false),
  // Unscheduled but checked (bonus) — must not count in the summary.
  row(4, "Work out", false, true),
  row(5, "Call mom", false, false),
];

function renderToday() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Today />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getToday).mockReset().mockResolvedValue(ROWS);
  vi.mocked(api.setHabitCheck).mockReset();
});

describe("Today dashboard", () => {
  it("shows the formatted date and a summary counting only scheduled habits", async () => {
    renderToday();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Friday, October 30/);
    expect(await screen.findByText("1 of 3 habits done")).toBeInTheDocument();
    expect(api.getToday).toHaveBeenCalledWith(TODAY);
  });

  it("lists scheduled habits first and collapses the unscheduled group", async () => {
    renderToday();
    expect(await screen.findByLabelText("Read")).toBeInTheDocument();
    expect(screen.queryByLabelText("Work out")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Not scheduled today \(2\)/ }));
    expect(screen.getByLabelText("Work out")).toBeChecked();
  });

  it("toggling a habit calls setHabitCheck with today from useToday", async () => {
    // Hold the request open so we observe the optimistic state before the refetch.
    let resolve!: (r: TodayHabit) => void;
    vi.mocked(api.setHabitCheck).mockImplementation(
      () => new Promise<TodayHabit>((r) => (resolve = r)),
    );
    renderToday();
    const checkbox = await screen.findByLabelText("Read");
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(api.setHabitCheck).toHaveBeenCalledWith(2, TODAY, TODAY, true);
    // Optimistic update flips the checkbox right away.
    expect(checkbox).toBeChecked();
    expect(screen.getByText("2 of 3 habits done")).toBeInTheDocument();

    vi.mocked(api.getToday).mockResolvedValue(
      ROWS.map((r) => (r.habit.id === 2 ? row(2, "Read", true, true) : r)),
    );
    resolve(row(2, "Read", true, true));
    await waitFor(() => expect(api.getToday).toHaveBeenCalledTimes(2));
    expect(checkbox).toBeChecked();
  });

  it("shows an empty state linking to the Habits page", async () => {
    vi.mocked(api.getToday).mockResolvedValue([]);
    renderToday();
    const link = await screen.findByRole("link", { name: /Add a habit/ });
    expect(link).toHaveAttribute("href", "/habits");
    expect(screen.getByText("No habits yet")).toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "Habits" }).closest("section")!;
    expect(within(card).getByText("No habits yet")).toBeInTheDocument();
  });
});
