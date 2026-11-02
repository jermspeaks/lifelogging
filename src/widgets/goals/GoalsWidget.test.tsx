import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoalSummary } from "@/lib/types";

import { GoalProgressInput } from "./GoalProgressInput";
import { GoalsWidget } from "./GoalsWidget";

const queries = vi.hoisted(() => ({
  useGoals: vi.fn(),
  useLogGoalProgress: vi.fn(),
  useSetGoalStatus: vi.fn(),
}));
vi.mock("@/lib/queries", () => queries);

const logMutate = vi.fn();
const statusMutate = vi.fn();
const goals: GoalSummary[] = [
  {
    goal: {
      id: 1,
      title: "Read 24 books",
      description: null,
      targetValue: 24,
      unit: "books",
      dueDate: "2026-10-28",
      status: "active",
      closedOn: null,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    current: 24,
    todayAmount: 2,
    percent: 100,
    daysLeft: -3,
  },
  {
    goal: {
      id: 2,
      title: "Run a half marathon",
      description: null,
      targetValue: null,
      unit: null,
      dueDate: "2026-11-12",
      status: "active",
      closedOn: null,
      sortOrder: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    current: 0,
    todayAmount: 0,
    percent: null,
    daysLeft: 12,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  queries.useGoals.mockReturnValue({ data: goals, isPending: false, error: null });
  queries.useLogGoalProgress.mockReturnValue({ mutateAsync: logMutate });
  queries.useSetGoalStatus.mockReturnValue({ mutate: statusMutate });
});

describe("GoalsWidget", () => {
  it("shows due labels, saves today's numeric progress, and completes milestones", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GoalsWidget today="2026-10-31" />
      </MemoryRouter>,
    );

    expect(screen.getByText("3 days overdue")).toHaveClass("text-destructive");
    expect(screen.getByText("12 days left")).toBeInTheDocument();
    expect(screen.getByText("Target reached · Complete?")).toBeInTheDocument();
    const input = screen.getByRole("spinbutton", { name: "Today progress for Read 24 books" });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(logMutate).toHaveBeenCalledWith({
        goalId: 1,
        date: "2026-10-31",
        today: "2026-10-31",
        amount: 5,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(statusMutate).toHaveBeenCalledWith(
      { id: 2, status: "completed", today: "2026-10-31" },
      expect.any(Object),
    );
  });

  it("allows retrying a progress save after the first attempt fails", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    render(<GoalProgressInput goalId={1} title="Read" amount={2} onSave={onSave} />);
    const input = screen.getByRole("spinbutton", { name: "Today progress for Read" });

    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    fireEvent.focus(input);
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith(1, 5);
  });

  it("links to goal management when there are no active goals", () => {
    queries.useGoals.mockReturnValue({ data: [], isPending: false, error: null });
    render(
      <MemoryRouter>
        <GoalsWidget today="2026-10-31" />
      </MemoryRouter>,
    );
    expect(screen.getByText("No active goals yet")).toHaveAttribute("data-today", "2026-10-31");
    expect(screen.getByRole("link", { name: "Add a goal" })).toHaveAttribute("href", "/goals");
  });
});
