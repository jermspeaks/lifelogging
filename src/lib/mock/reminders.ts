import type { Api } from "../api";
import { addDays, todayLocal } from "../date";
import type { ErrorPayload, NewReminder, Reminder, ReminderPatch } from "../types";

type RemindersApi = Pick<
  Api,
  | "listReminders"
  | "getDueReminders"
  | "createReminder"
  | "updateReminder"
  | "setReminderDone"
  | "deleteReminder"
>;

const TITLE_MAX = 200;
const NOTES_MAX = 1_000;

function fail(kind: ErrorPayload["kind"], message: string): never {
  throw { kind, message } satisfies ErrorPayload;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validateDate(value: string) {
  if (!isDate(value)) fail("Validation", "Date must be a valid YYYY-MM-DD date");
}

function validateTime(value: string | null | undefined) {
  if (value == null || value === "") return;
  if (!/^\d{2}:\d{2}$/.test(value)) fail("Validation", "Time must be HH:MM");
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) fail("Validation", "Time must be between 00:00 and 23:59");
}

function validate(title: string, notes: string | null, dueDate: string, dueTime: string | null) {
  const titleLength = Array.from(title.trim()).length;
  if (titleLength === 0) fail("Validation", "Title is required.");
  if (titleLength > TITLE_MAX) fail("Validation", `Title must be at most ${TITLE_MAX} characters.`);
  if (notes && Array.from(notes).length > NOTES_MAX)
    fail("Validation", `Notes must be at most ${NOTES_MAX} characters.`);
  validateDate(dueDate);
  validateTime(dueTime);
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function compareOrder(left: Reminder, right: Reminder): number {
  return (
    left.dueDate.localeCompare(right.dueDate) ||
    Number(left.dueTime !== null) - Number(right.dueTime !== null) ||
    (left.dueTime ?? "").localeCompare(right.dueTime ?? "") ||
    left.id - right.id
  );
}

export function createRemindersMock(): RemindersApi {
  const today = todayLocal();
  let nextId = 5;
  const timestamp = () => new Date().toISOString();
  const seededAt = timestamp();
  const reminders = new Map<number, Reminder>([
    [
      1,
      {
        id: 1,
        title: "Book a dentist appointment",
        notes: null,
        dueDate: addDays(today, -1),
        dueTime: null,
        completedOn: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
    [
      2,
      {
        id: 2,
        title: "Pick up groceries",
        notes: "Milk, fruit, and coffee",
        dueDate: today,
        dueTime: "17:30",
        completedOn: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
    [
      3,
      {
        id: 3,
        title: "Plan the weekend",
        notes: null,
        dueDate: addDays(today, 2),
        dueTime: null,
        completedOn: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
    [
      4,
      {
        id: 4,
        title: "Send the project update",
        notes: null,
        dueDate: today,
        dueTime: null,
        completedOn: today,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
  ]);

  function mustGet(id: number): Reminder {
    const reminder = reminders.get(id);
    if (!reminder) fail("NotFound", `Reminder ${id} not found`);
    return reminder;
  }

  function list(todayDate: string, includeCompleted: boolean): Reminder[] {
    validateDate(todayDate);
    const firstDay = addDays(todayDate, -29);
    return [...reminders.values()]
      .filter(
        (reminder) =>
          reminder.completedOn === null ||
          (includeCompleted &&
            reminder.completedOn >= firstDay &&
            reminder.completedOn <= todayDate),
      )
      .sort(compareOrder)
      .map((reminder) => ({ ...reminder }));
  }

  function create(input: NewReminder): Reminder {
    const title = input.title.trim();
    const notes = clean(input.notes);
    const dueTime = clean(input.dueTime);
    validate(title, notes, input.dueDate, dueTime);
    const now = timestamp();
    const reminder: Reminder = {
      id: nextId++,
      title,
      notes,
      dueDate: input.dueDate,
      dueTime,
      completedOn: null,
      createdAt: now,
      updatedAt: now,
    };
    reminders.set(reminder.id, reminder);
    return { ...reminder };
  }

  return {
    listReminders: async (todayDate, includeCompleted) => list(todayDate, includeCompleted),
    getDueReminders: async (todayDate) =>
      list(todayDate, true).filter(
        (reminder) =>
          reminder.completedOn === todayDate ||
          (reminder.completedOn === null && reminder.dueDate <= todayDate),
      ),
    createReminder: async (input) => create(input),
    updateReminder: async (id, patch: ReminderPatch) => {
      const current = mustGet(id);
      const next: Reminder = {
        ...current,
        title: patch.title !== undefined ? patch.title.trim() : current.title,
        notes: patch.notes != null ? clean(patch.notes) : current.notes,
        dueDate: patch.dueDate ?? current.dueDate,
        dueTime:
          patch.dueTime !== undefined && patch.dueTime !== null
            ? clean(patch.dueTime)
            : current.dueTime,
        updatedAt: timestamp(),
      };
      validate(next.title, next.notes, next.dueDate, next.dueTime);
      reminders.set(id, next);
      return { ...next };
    },
    setReminderDone: async (id, todayDate, done) => {
      validateDate(todayDate);
      const current = mustGet(id);
      const completedOn = done ? todayDate : null;
      if (current.completedOn === completedOn) return { ...current };
      const updated = { ...current, completedOn, updatedAt: timestamp() };
      reminders.set(id, updated);
      return { ...updated };
    },
    deleteReminder: async (id) => {
      mustGet(id);
      reminders.delete(id);
    },
  };
}
