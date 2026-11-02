import { describe, expect, it } from "vitest";

import { createRemindersMock } from "./reminders";

describe("reminders mock", () => {
  it("seeds overdue, today, and future reminders and sorts the due set", async () => {
    const api = createRemindersMock();
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const rows = await api.listReminders(isoToday, false);
    expect(rows.some((item) => item.dueDate < isoToday && item.completedOn === null)).toBe(true);
    expect(rows.some((item) => item.dueDate === isoToday)).toBe(true);
    expect(rows.some((item) => item.dueDate > isoToday)).toBe(true);
    expect((await api.getDueReminders(isoToday)).map((item) => item.dueDate)).toEqual(
      [...(await api.getDueReminders(isoToday))].map((item) => item.dueDate).sort(),
    );
  });

  it("validates fields and supports completion and empty-string clearing", async () => {
    const api = createRemindersMock();
    const reminder = await api.createReminder({
      title: "  Call home  ",
      dueDate: "2026-10-31",
      dueTime: "09:30",
      notes: " note ",
    });
    expect(reminder).toMatchObject({ title: "Call home", notes: "note", dueTime: "09:30" });
    const updated = await api.updateReminder(reminder.id, { dueTime: "", notes: "" });
    expect(updated).toMatchObject({ dueTime: null, notes: null });
    expect((await api.setReminderDone(reminder.id, "2026-10-31", true)).completedOn).toBe(
      "2026-10-31",
    );
    await expect(api.createReminder({ title: " ", dueDate: "2026-10-31" })).rejects.toMatchObject({
      kind: "Validation",
    });
  });
});
