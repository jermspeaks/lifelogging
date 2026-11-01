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

  it("imports, replaces, lists, and removes calendar sources", async () => {
    const api = createMockApi();
    const ics = (summary: string) =>
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1\r\nSUMMARY:${summary}\r\nDTSTART;VALUE=DATE:20301031\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    const source = await api.importCalendar("home.ics", ics("Birthday"));
    expect(source.eventCount).toBe(1);
    expect(await api.listCalendarSources()).toContainEqual(source);
    expect((await api.getUpcomingEvents("2030-10-31")).map((event) => event.summary)).toEqual([
      "Birthday",
    ]);

    const replacement = await api.importCalendar("home-updated.ics", ics("Anniversary"), source.id);
    expect(replacement.id).toBe(source.id);
    expect(replacement.name).toBe("home-updated.ics");
    expect((await api.getUpcomingEvents("2030-10-31")).map((event) => event.summary)).toEqual([
      "Anniversary",
    ]);

    await api.deleteCalendar(source.id);
    expect((await api.listCalendarSources()).map((item) => item.name)).toEqual(["Sample calendar"]);
    expect(await api.getUpcomingEvents("2030-10-31")).toEqual([]);
  });

  it("expands annual all-day events and rejects invalid replacement without losing prior data", async () => {
    const api = createMockApi();
    const birthday =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:birthday\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:19900115\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    const source = await api.importCalendar("birthdays.ics", birthday);
    const occurrence = await api.getUpcomingEvents("2026-01-14");
    expect(occurrence).toHaveLength(1);
    expect(occurrence[0]).toMatchObject({ date: "2026-01-15", allDay: true, startTime: null });

    await expect(api.importCalendar("broken.ics", "not an ics", source.id)).rejects.toEqual(
      expect.objectContaining({ kind: "Validation" }),
    );
    expect(await api.listCalendarSources()).toContainEqual(source);
    expect(await api.getUpcomingEvents("2026-01-14")).toHaveLength(1);
  });
});
