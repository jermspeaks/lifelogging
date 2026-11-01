// In-memory stand-in for the Rust backend, for UI work in a plain browser (VITE_MOCK_API=1).
// Mirrors SPEC §§6 and 11 closely enough to exercise the UI; Rust remains the source of truth.
import type { Api } from "./api";
import { addDays, fromISODate, todayLocal } from "./date";
import type {
  CalendarSource,
  DayEntry,
  ErrorPayload,
  EventOccurrence,
  Habit,
  HabitPatch,
  NewHabit,
  TodayHabit,
} from "./types";

const EVERY_DAY = 127;

function unescapeIcsText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([\\,;])/g, "$1");
}

function unfoldIcs(content: string): string[] {
  const lines: string[] = [];
  for (const line of content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (/^[ \t]/.test(line) && lines.length) lines[lines.length - 1] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

function parseIcsDate(value: string): { date: string; time: string | null; allDay: boolean } {
  if (/^\d{8}$/.test(value)) {
    return {
      date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
      time: null,
      allDay: true,
    };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(?:\d{2})?(Z)?$/.exec(value);
  if (!match) fail("Validation", `Unsupported event date '${value}'.`);
  if (match[7]) {
    const instant = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`);
    return {
      date: `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`,
      time: `${String(instant.getHours()).padStart(2, "0")}:${String(instant.getMinutes()).padStart(2, "0")}`,
      allDay: false,
    };
  }
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
    allDay: false,
  };
}

function readIcsEvents(content: string): Array<{
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  date: string;
  dates: string[];
  excludedDates: string[];
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  annual: boolean;
}> {
  const lines = unfoldIcs(content);
  if (
    !lines.some((line) => line.toUpperCase() === "BEGIN:VCALENDAR") ||
    !lines.some((line) => line.toUpperCase() === "END:VCALENDAR")
  )
    fail("Validation", "Couldn't read calendar file: missing VCALENDAR boundary.");
  const result: ReturnType<typeof readIcsEvents> = [];
  let eventLines: string[] | null = null;
  for (const line of lines) {
    if (line.toUpperCase() === "BEGIN:VEVENT") eventLines = [];
    else if (line.toUpperCase() === "END:VEVENT" && eventLines) {
      const props = new Map<string, string>();
      const extras = new Map<string, string[]>();
      for (const entry of eventLines) {
        const colon = entry.indexOf(":");
        if (colon < 0) continue;
        const key = entry.slice(0, colon).split(";")[0].toUpperCase();
        const value = entry.slice(colon + 1);
        if (["RDATE", "EXDATE"].includes(key)) extras.set(key, [...(extras.get(key) ?? []), value]);
        else if (!props.has(key)) props.set(key, value);
      }
      if (props.get("STATUS")?.toUpperCase() !== "CANCELLED") {
        const uid = props.get("UID")?.trim();
        const summary = props.get("SUMMARY")?.trim();
        const start = props.get("DTSTART");
        if (!uid || !summary || !start)
          fail("Validation", "Every event needs a UID, summary, and DTSTART.");
        const parsedStart = parseIcsDate(start);
        const end = props.get("DTEND");
        const parsedEnd = end ? parseIcsDate(end) : null;
        const rrule = props.get("RRULE") ?? "";
        const annual = /(?:^|;)FREQ=YEARLY(?:;|$)/i.test(rrule);
        const exclusions = (extras.get("EXDATE") ?? []).flatMap((value) =>
          value.split(",").map((item) => parseIcsDate(item).date),
        );
        const dates = [parsedStart.date];
        for (const value of extras.get("RDATE") ?? []) {
          for (const item of value.split(",")) dates.push(parseIcsDate(item).date);
        }
        result.push({
          uid,
          summary: unescapeIcsText(summary),
          description: props.has("DESCRIPTION") ? unescapeIcsText(props.get("DESCRIPTION")!) : null,
          location: props.has("LOCATION") ? unescapeIcsText(props.get("LOCATION")!) : null,
          date: parsedStart.date,
          dates,
          excludedDates: exclusions,
          allDay: parsedStart.allDay,
          startTime: parsedStart.time,
          endTime: parsedEnd?.time ?? null,
          annual,
        });
      }
      eventLines = null;
    } else if (eventLines) eventLines.push(line);
  }
  if (eventLines) fail("Validation", "Calendar contains an unfinished event.");
  return result;
}

function fail(kind: ErrorPayload["kind"], message: string): never {
  throw { kind, message } satisfies ErrorPayload;
}

/** Bit 0 = Monday … bit 6 = Sunday. */
export function isScheduled(scheduleDays: number, iso: string): boolean {
  const mondayIndex = (fromISODate(iso).getDay() + 6) % 7;
  return (scheduleDays & (1 << mondayIndex)) !== 0;
}

function validate(name: string, description: string | null, scheduleDays: number) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) fail("Validation", "Name must be 1–80 characters");
  if (description && description.length > 500)
    fail("Validation", "Description must be at most 500 characters");
  if (!Number.isInteger(scheduleDays) || scheduleDays < 1 || scheduleDays > 127)
    fail("Validation", "Pick at least one day");
}

export function createMockApi(): Api {
  let nextId = 1;
  const habits = new Map<number, Habit>();
  const checks = new Map<number, Set<string>>();
  const calendars = new Map<
    number,
    {
      source: CalendarSource;
      events: EventOccurrence[];
      recurrence: Map<number, { annual: boolean; dates: string[]; excludedDates: string[] }>;
    }
  >();
  let nextCalendarId = 1;
  let nextEventId = 1;

  const now = () => new Date().toISOString();
  const createdDate = (h: Habit) => h.createdAt.slice(0, 10);
  const maxOrder = () => Math.max(0, ...[...habits.values()].map((h) => h.sortOrder));
  const active = () =>
    [...habits.values()].filter((h) => !h.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);

  function mustGet(id: number): Habit {
    const h = habits.get(id);
    if (!h) fail("NotFound", `Habit ${id} not found`);
    return h;
  }

  function streak(h: Habit, today: string): number {
    const done = checks.get(h.id) ?? new Set();
    const created = createdDate(h);
    let day = today;
    if (isScheduled(h.scheduleDays, day) && !done.has(day)) day = addDays(day, -1);
    let count = 0;
    while (day >= created) {
      if (isScheduled(h.scheduleDays, day)) {
        if (!done.has(day)) break;
        count++;
      }
      day = addDays(day, -1);
    }
    return count;
  }

  function last7(h: Habit, today: string): DayEntry[] {
    const done = checks.get(h.id) ?? new Set();
    const created = createdDate(h);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      let status: DayEntry["status"];
      if (done.has(date)) status = "done";
      else if (date < created || !isScheduled(h.scheduleDays, date)) status = "skipped";
      else status = date === today ? "pending" : "missed";
      return { date, status };
    });
  }

  function todayRow(h: Habit, today: string): TodayHabit {
    return {
      habit: { ...h },
      scheduledToday: isScheduled(h.scheduleDays, today),
      doneToday: checks.get(h.id)?.has(today) ?? false,
      currentStreak: streak(h, today),
      last7: last7(h, today),
    };
  }

  function create(input: NewHabit, createdAt = now()): Habit {
    const description = input.description?.trim() || null;
    const scheduleDays = input.scheduleDays ?? EVERY_DAY;
    validate(input.name, description, scheduleDays);
    const h: Habit = {
      id: nextId++,
      name: input.name.trim(),
      description,
      color: input.color ?? "slate",
      scheduleDays,
      sortOrder: maxOrder() + 1,
      archivedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    habits.set(h.id, h);
    checks.set(h.id, new Set());
    return h;
  }

  // Seed data so the dashboard has something to show.
  const today = todayLocal();
  const twoWeeksAgo = fromISODate(addDays(today, -14)).toISOString();
  const read = create({ name: "Read 20 pages", color: "blue" }, twoWeeksAgo);
  const gym = create({ name: "Work out", color: "green", scheduleDays: 0b0010101 }, twoWeeksAgo);
  create({ name: "Practice Chinese", description: "Flashcards + one lesson", color: "red" });
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, -i);
    if (i !== 5) checks.get(read.id)!.add(d);
    if (isScheduled(gym.scheduleDays, d) && i < 9) checks.get(gym.id)!.add(d);
  }
  const sampleSourceId = nextCalendarId++;
  const sampleEvents: EventOccurrence[] = [
    {
      id: nextEventId++,
      sourceId: sampleSourceId,
      sourceName: "Sample calendar",
      uid: "sample-today",
      summary: "Plan the day",
      description: null,
      location: null,
      date: today,
      allDay: true,
      startTime: null,
      endTime: null,
    },
    {
      id: nextEventId++,
      sourceId: sampleSourceId,
      sourceName: "Sample calendar",
      uid: "sample-tomorrow",
      summary: "Walk with a friend",
      description: null,
      location: "Park",
      date: addDays(today, 1),
      allDay: false,
      startTime: "17:30",
      endTime: "18:00",
    },
  ];
  calendars.set(sampleSourceId, {
    source: { id: sampleSourceId, name: "Sample calendar", importedAt: now(), eventCount: 2 },
    events: sampleEvents,
    recurrence: new Map(
      sampleEvents.map((event) => [
        event.id,
        { annual: false, dates: [event.date], excludedDates: [] },
      ]),
    ),
  });

  const delay = <T>(fn: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e);
        }
      }, 80),
    );

  return {
    listHabits: (includeArchived) =>
      delay(() =>
        [...habits.values()]
          .filter((h) => includeArchived || !h.archivedAt)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((h) => ({ ...h })),
      ),
    getHabit: (id) => delay(() => ({ ...mustGet(id) })),
    createHabit: (input) => delay(() => ({ ...create(input) })),
    updateHabit: (id, patch: HabitPatch) =>
      delay(() => {
        const h = mustGet(id);
        const next: Habit = {
          ...h,
          name: patch.name !== undefined ? patch.name.trim() : h.name,
          description:
            patch.description !== undefined ? patch.description.trim() || null : h.description,
          color: patch.color ?? h.color,
          scheduleDays: patch.scheduleDays ?? h.scheduleDays,
          updatedAt: now(),
        };
        validate(next.name, next.description, next.scheduleDays);
        habits.set(id, next);
        return { ...next };
      }),
    archiveHabit: (id) =>
      delay(() => {
        const h = { ...mustGet(id), archivedAt: now(), updatedAt: now() };
        habits.set(id, h);
        return { ...h };
      }),
    unarchiveHabit: (id) =>
      delay(() => {
        const h = { ...mustGet(id), archivedAt: null, sortOrder: maxOrder() + 1, updatedAt: now() };
        habits.set(id, h);
        return { ...h };
      }),
    deleteHabit: (id) =>
      delay(() => {
        mustGet(id);
        habits.delete(id);
        checks.delete(id);
      }),
    reorderHabits: (ids) =>
      delay(() => {
        const activeIds = active().map((h) => h.id);
        const same =
          ids.length === activeIds.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => activeIds.includes(id));
        if (!same) fail("Validation", "Reorder must include every active habit exactly once");
        ids.forEach((id, i) => habits.set(id, { ...habits.get(id)!, sortOrder: i + 1 }));
      }),
    setHabitCheck: (habitId, date, today, done) =>
      delay(() => {
        const h = mustGet(habitId);
        if (date > today) fail("Validation", "Can't check a habit in the future");
        const set = checks.get(habitId)!;
        if (done) set.add(date);
        else set.delete(date);
        return todayRow(h, today);
      }),
    getToday: (today) => delay(() => active().map((h) => todayRow(h, today))),
    listCalendarSources: () =>
      delay(() =>
        [...calendars.values()]
          .map(({ source }) => ({ ...source }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
      ),
    importCalendar: (name, content, sourceId) =>
      delay(() => {
        const cleanName = name.trim();
        if (!cleanName || cleanName.length > 255)
          fail("Validation", "Calendar name must be 1–255 characters.");
        if (new TextEncoder().encode(content).length > 5 * 1024 * 1024)
          fail("Validation", "Calendar file exceeds the 5 MiB import limit.");
        const parsed = readIcsEvents(content);
        if (parsed.length > 5000) fail("Validation", "Calendar contains more than 5,000 events.");
        const uids = parsed.map((event) => event.uid);
        if (new Set(uids).size !== uids.length)
          fail("Validation", "Calendar contains duplicate event UIDs.");
        const id = sourceId ?? nextCalendarId++;
        if (sourceId !== undefined && !calendars.has(sourceId))
          fail("NotFound", `Calendar source ${sourceId} not found.`);
        const recurrence = new Map<
          number,
          { annual: boolean; dates: string[]; excludedDates: string[] }
        >();
        const events = parsed.map((event) => {
          const eventId = nextEventId++;
          recurrence.set(eventId, {
            annual: event.annual,
            dates: event.dates,
            excludedDates: event.excludedDates,
          });
          return {
            id: eventId,
            sourceId: id,
            sourceName: cleanName,
            uid: event.uid,
            summary: event.summary,
            description: event.description,
            location: event.location,
            date: event.date,
            allDay: event.allDay,
            startTime: event.startTime,
            endTime: event.endTime,
          } satisfies EventOccurrence;
        });
        const source: CalendarSource = {
          id,
          name: cleanName,
          importedAt: now(),
          eventCount: events.length,
        };
        calendars.set(id, { source, events, recurrence });
        return { ...source };
      }),
    deleteCalendar: (sourceId) =>
      delay(() => {
        if (!calendars.delete(sourceId)) fail("NotFound", `Calendar source ${sourceId} not found.`);
      }),
    getUpcomingEvents: (today) =>
      delay(() => {
        const occurrences: EventOccurrence[] = [];
        for (const { events, recurrence } of calendars.values()) {
          for (const event of events) {
            const rule = recurrence.get(event.id)!;
            for (let offset = 0; offset < 4; offset++) {
              const date = addDays(today, offset);
              const occurs =
                (rule.annual && date.slice(5) === event.date.slice(5)) || rule.dates.includes(date);
              if (occurs && !rule.excludedDates.includes(date))
                occurrences.push({ ...event, date });
            }
          }
        }
        return occurrences.sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            Number(b.allDay) - Number(a.allDay) ||
            (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
            a.summary.localeCompare(b.summary),
        );
      }),
  };
}
