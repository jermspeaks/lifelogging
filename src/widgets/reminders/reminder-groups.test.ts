import { describe, expect, it } from "vitest";

import type { Reminder } from "@/lib/types";

import { groupUpcomingReminders } from "./reminder-groups";

function reminder(id: number, dueDate: string, completedOn: string | null = null): Reminder {
  return {
    id,
    title: `Reminder ${id}`,
    notes: null,
    dueDate,
    dueTime: null,
    completedOn,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("groupUpcomingReminders", () => {
  it("groups overdue, today, tomorrow, and later dates in calendar order", () => {
    const groups = groupUpcomingReminders(
      [
        reminder(1, "2026-10-30"),
        reminder(2, "2026-11-02"),
        reminder(3, "2026-11-01"),
        reminder(4, "2026-11-04"),
        reminder(5, "2026-11-03"),
        reminder(6, "2026-10-31", "2026-10-31"),
      ],
      "2026-11-01",
    );

    expect(groups.map((group) => group.key)).toEqual([
      "overdue",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
    expect(groups.map((group) => group.reminders.map(({ id }) => id))).toEqual([
      [1],
      [3],
      [2],
      [5],
      [4],
    ]);
    expect(groups[0]).toMatchObject({ label: "Overdue", overdue: true });
  });

  it("returns no groups when only completed reminders are supplied", () => {
    expect(groupUpcomingReminders([reminder(1, "2026-10-30", "2026-10-30")], "2026-11-01")).toEqual(
      [],
    );
  });
});
