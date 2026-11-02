import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoalFormDialog } from "./GoalFormDialog";

const queries = vi.hoisted(() => ({ useCreateGoal: vi.fn(), useUpdateGoal: vi.fn() }));
vi.mock("@/lib/queries", () => queries);

const createMutate = vi.fn();
const updateMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  queries.useCreateGoal.mockReturnValue({ mutate: createMutate, isPending: false });
  queries.useUpdateGoal.mockReturnValue({ mutate: updateMutate, isPending: false });
});

describe("GoalFormDialog", () => {
  it("reveals numeric fields when Track a number is enabled", async () => {
    const user = userEvent.setup();
    render(<GoalFormDialog open onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Title"), "Read 24 books");
    expect(screen.queryByLabelText("Target")).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Track a number" }));
    expect(screen.getByLabelText("Target")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Target"), "24");
    await user.type(screen.getByLabelText(/Unit/), "books");
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        { title: "Read 24 books", targetValue: 24, unit: "books" },
        expect.any(Object),
      ),
    );
  });

  it("submits null when editing a numeric goal as a milestone", async () => {
    const user = userEvent.setup();
    const goal = {
      id: 4,
      title: "Read books",
      description: null,
      targetValue: 24,
      unit: "books",
      dueDate: null,
      status: "active" as const,
      closedOn: null,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    render(<GoalFormDialog open onOpenChange={vi.fn()} goal={goal} />);
    await user.click(screen.getByRole("switch", { name: "Track a number" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: 4,
          patch: { title: "Read books", description: "", targetValue: null, unit: "", dueDate: "" },
        },
        expect.any(Object),
      ),
    );
  });
});
