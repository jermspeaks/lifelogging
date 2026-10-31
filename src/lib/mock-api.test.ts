import { addDays, todayLocal } from "./date";
import { createMockApi, isScheduled } from "./mock-api";

describe("mock api", () => {
  it("treats bit 0 as Monday", () => {
    expect(isScheduled(0b0000001, "2026-10-26")).toBe(true); // Monday
    expect(isScheduled(0b0000001, "2026-10-27")).toBe(false);
    expect(isScheduled(0b1000000, "2026-11-01")).toBe(true); // Sunday
  });

  it("supports CRUD and checks", async () => {
    const api = createMockApi();
    const today = todayLocal();
    const created = await api.createHabit({ name: "  Stretch  " });
    expect(created.name).toBe("Stretch");
    expect(created.scheduleDays).toBe(127);

    const row = await api.setHabitCheck(created.id, today, today, true);
    expect(row.doneToday).toBe(true);
    expect(row.last7.at(-1)).toEqual({ date: today, status: "done" });

    await expect(api.setHabitCheck(created.id, addDays(today, 1), today, true)).rejects.toEqual(
      expect.objectContaining({ kind: "Validation" }),
    );

    await api.archiveHabit(created.id);
    expect((await api.getToday(today)).some((r) => r.habit.id === created.id)).toBe(false);

    await api.deleteHabit(created.id);
    await expect(api.getHabit(created.id)).rejects.toEqual(
      expect.objectContaining({ kind: "NotFound" }),
    );
  });

  it("rejects an empty name", async () => {
    await expect(createMockApi().createHabit({ name: "   " })).rejects.toEqual(
      expect.objectContaining({ kind: "Validation" }),
    );
  });
});
