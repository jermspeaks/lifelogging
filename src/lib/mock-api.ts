// In-memory stand-in for the Rust backend, for UI work in a plain browser (VITE_MOCK_API=1).
// Mirrors SPEC §6 closely enough to exercise the UI; the Rust implementation is the source of truth.
import type { Api } from "./api";
import { addDays, fromISODate, todayLocal } from "./date";
import type { DayEntry, ErrorPayload, Habit, HabitPatch, NewHabit, TodayHabit } from "./types";

const EVERY_DAY = 127;

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
  };
}
