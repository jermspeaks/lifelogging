import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoalSummary } from "@/lib/types";

import Goals from "./Goals";

const queries = vi.hoisted(() => ({
  useGoals: vi.fn(),
  useCreateGoal: vi.fn(),
  useUpdateGoal: vi.fn(),
  useSetGoalStatus: vi.fn(),
  useDeleteGoal: vi.fn(),
  useReorderGoals: vi.fn(),
}));
vi.mock("@/lib/queries", () => queries);
vi.mock("@/lib/date", () => ({ useToday: () => "2026-10-31" }));

const statusMutate = vi.fn();
const deleteMutate = vi.fn();
const goals: GoalSummary[] = [
  {
    goal: {
      id: 1,
      title: "Read books",
      description: "Read more",
      targetValue: 24,
      unit: "books",
      dueDate: null,
      status: "active",
      closedOn: null,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    current: 5,
    todayAmount: 1,
    percent: 21,
    daysLeft: null,
  },
  {
    goal: {
      id: 2,
      title: "Old milestone",
      description: null,
      targetValue: null,
      unit: null,
      dueDate: null,
      status: "completed",
      closedOn: "2026-10-20",
      sortOrder: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    current: 0,
    todayAmount: 0,
    percent: null,
    daysLeft: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  queries.useGoals.mockReturnValue({ data: goals, isPending: false, error: null });
  queries.useCreateGoal.mockReturnValue({ mutate: vi.fn(), isPending: false });
  queries.useUpdateGoal.mockReturnValue({ mutate: vi.fn(), isPending: false });
  queries.useSetGoalStatus.mockReturnValue({ mutate: statusMutate });
  queries.useDeleteGoal.mockReturnValue({ mutate: deleteMutate });
  queries.useReorderGoals.mockReturnValue({ mutate: vi.fn() });
});

describe("Goals route", () => {
  it("shows active goals and handles the closed section reopen and delete confirmation", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Goals />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Read books")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Closed (1)" }));
    expect(screen.getByText("Old milestone")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen Old milestone" }));
    expect(statusMutate).toHaveBeenCalledWith(
      { id: 2, status: "active", today: "2026-10-31" },
      expect.any(Object),
    );

    await user.click(screen.getByRole("button", { name: "Delete Old milestone" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith(2, expect.any(Object)));
  });
});
