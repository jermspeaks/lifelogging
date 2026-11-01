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

  it("imports a calendar, expands a yearly birthday, replaces by name, and deletes", async () => {
    const api = createMockApi();
    const birthday = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:birthday",
      "DTSTART;VALUE=DATE:19901103",
      "RRULE:FREQ=YEARLY",
      "SUMMARY:Mom's birthday",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const imported = await api.importCalendar(" Family ", birthday);
    expect(imported.importedEventCount).toBe(1);
    expect(imported.calendar.name).toBe("Family");
    expect(await api.getUpcomingEvents("2026-11-01")).toEqual([
      expect.objectContaining({ summary: "Mom's birthday", startDate: "2026-11-03", allDay: true }),
    ]);

    const replacement = await api.importCalendar("Family", birthday.replace("birthday", "other"));
    expect(replacement.calendar.id).toBe(imported.calendar.id);
    await api.deleteCalendar(imported.calendar.id);
    expect(await api.listCalendars()).toEqual([]);
  });

  it("rejects an empty name", async () => {
    await expect(createMockApi().createHabit({ name: "   " })).rejects.toEqual(
      expect.objectContaining({ kind: "Validation" }),
    );
  });
});
