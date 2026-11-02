import { describe, expect, it } from "vitest";

import { createGoalsMock } from "./goals";

describe("goals mock", () => {
  it("seeds numeric and milestone goals and replaces or removes daily progress", async () => {
    const mock = createGoalsMock();
    const today = "2026-10-31";
    const initial = await mock.listGoals(today, false);
    expect(initial.map((summary) => summary.goal.targetValue)).toEqual([24, null]);

    const logged = await mock.logGoalProgress(initial[0].goal.id, today, today, 2.5);
    expect(logged.current).toBe(2.5);
    const replaced = await mock.logGoalProgress(initial[0].goal.id, today, today, 4);
    expect(replaced.current).toBe(4);
    const removed = await mock.logGoalProgress(initial[0].goal.id, today, today, 0);
    expect(removed.current).toBe(0);
  });

  it("preserves explicit null target updates and rejects milestone logging", async () => {
    const mock = createGoalsMock();
    const today = "2026-10-31";
    const [numeric, milestone] = await mock.listGoals(today, false);
    const converted = await mock.updateGoal(numeric.goal.id, { targetValue: null });
    expect(converted.targetValue).toBeNull();
    await expect(mock.logGoalProgress(milestone.goal.id, today, today, 1)).rejects.toMatchObject({
      kind: "Validation",
    });
    await expect(mock.logGoalProgress(numeric.goal.id, today, today, 1)).rejects.toMatchObject({
      kind: "Validation",
    });
  });
});
