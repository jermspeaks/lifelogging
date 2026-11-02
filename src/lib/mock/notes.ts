import type { Api } from "../api";
import { addDays, todayLocal } from "../date";
import type { ErrorPayload, NewNote, Note, NotePatch } from "../types";

type NotesApi = Pick<
  Api,
  | "listNotes"
  | "createNote"
  | "updateNote"
  | "reviewNote"
  | "setNoteArchived"
  | "deleteNote"
  | "getReviewQueue"
>;

const INTERVALS = [1, 3, 7, 14, 30, 60, 120];

function fail(kind: ErrorPayload["kind"], message: string): never {
  throw { kind, message } satisfies ErrorPayload;
}

function chars(value: string): number {
  return Array.from(value).length;
}

function parseDate(value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    fail("Validation", "Date must be a valid YYYY-MM-DD date");
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function validate(title: string, body: string | null, url: string | null): void {
  const titleLength = chars(title);
  if (titleLength < 1 || titleLength > 200) fail("Validation", "Title must be 1–200 characters");
  if (body !== null && chars(body) > 5_000)
    fail("Validation", "Body must be at most 5,000 characters");
  if (url !== null) {
    const authority = url.slice(url.indexOf("://") + 3).split(/[/?#]/u, 1)[0];
    const valid = (() => {
      try {
        const parsed = new URL(url);
        return (
          authority.length > 0 &&
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          Boolean(parsed.hostname) &&
          !/\s/u.test(url)
        );
      } catch {
        return false;
      }
    })();
    if (chars(url) > 2_000 || !valid)
      fail("Validation", "URL must be an absolute http or https URL with a host");
  }
}

function matches(note: Note, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return [note.title, note.body ?? "", note.url ?? ""].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  );
}

export function createNotesMock(): NotesApi {
  let nextId = 4;
  const timestamp = () => new Date().toISOString();
  const today = todayLocal();
  const seededAt = `${today}T12:00:00.000Z`;
  const notes = new Map<number, Note>([
    [
      1,
      {
        id: 1,
        title: "A small idea to revisit",
        body: "Leave a little room for curiosity.\n\nWhat would this look like as a tiny experiment?",
        url: null,
        reviewStage: 1,
        nextReviewDate: addDays(today, -1),
        lastReviewedOn: addDays(today, -4),
        archivedAt: null,
        createdAt: addDays(seededAt.slice(0, 10), -12) + "T12:00:00.000Z",
        updatedAt: seededAt,
      },
    ],
    [
      2,
      {
        id: 2,
        title: "A useful article",
        body: "Read this again when planning the next project.",
        url: "https://example.com/",
        reviewStage: 0,
        nextReviewDate: today,
        lastReviewedOn: null,
        archivedAt: null,
        createdAt: addDays(today, -3) + "T12:00:00.000Z",
        updatedAt: seededAt,
      },
    ],
    [
      3,
      {
        id: 3,
        title: "An idea for later",
        body: null,
        url: null,
        reviewStage: 2,
        nextReviewDate: addDays(today, 4),
        lastReviewedOn: addDays(today, -3),
        archivedAt: null,
        createdAt: addDays(today, -20) + "T12:00:00.000Z",
        updatedAt: seededAt,
      },
    ],
  ]);

  function mustGet(id: number): Note {
    const note = notes.get(id);
    if (!note) fail("NotFound", `Note ${id} not found`);
    return note;
  }

  function copy(note: Note): Note {
    return { ...note };
  }

  function create(input: NewNote, date: string): Note {
    parseDate(date);
    const url = clean(input.url);
    const title = input.title.trim() || url || "";
    const body = clean(input.body);
    validate(title, body, url);
    const createdAt = timestamp();
    const note: Note = {
      id: nextId++,
      title,
      body,
      url,
      reviewStage: 0,
      nextReviewDate: addDays(date, 1),
      lastReviewedOn: null,
      archivedAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    notes.set(note.id, note);
    return copy(note);
  }

  return {
    listNotes: async (query, includeArchived) =>
      [...notes.values()]
        .filter((note) => includeArchived || !note.archivedAt)
        .filter((note) => !query?.trim() || matches(note, query))
        .sort((a, b) => b.id - a.id)
        .map(copy),
    createNote: async (input, date) => create(input, date),
    updateNote: async (id, patch: NotePatch) => {
      const current = mustGet(id);
      const title = patch.title !== undefined ? patch.title.trim() : current.title;
      const body = patch.body !== undefined ? clean(patch.body) : current.body;
      const url = patch.url !== undefined ? clean(patch.url) : current.url;
      validate(title, body, url);
      const updated = { ...current, title, body, url, updatedAt: timestamp() };
      notes.set(id, updated);
      return copy(updated);
    },
    reviewNote: async (id, date, action) => {
      parseDate(date);
      const current = mustGet(id);
      if (current.archivedAt) fail("Validation", "Archived notes cannot be reviewed");
      const updated: Note =
        action === "keep"
          ? {
              ...current,
              reviewStage: current.reviewStage + 1,
              nextReviewDate: addDays(date, INTERVALS[Math.min(current.reviewStage + 1, 6)]),
              lastReviewedOn: date,
              updatedAt: timestamp(),
            }
          : { ...current, nextReviewDate: addDays(date, 1), updatedAt: timestamp() };
      notes.set(id, updated);
      return copy(updated);
    },
    setNoteArchived: async (id, archived, date) => {
      parseDate(date);
      const current = mustGet(id);
      if (Boolean(current.archivedAt) === archived) return copy(current);
      const now = timestamp();
      const updated: Note = archived
        ? { ...current, archivedAt: now, nextReviewDate: null, updatedAt: now }
        : {
            ...current,
            archivedAt: null,
            reviewStage: 0,
            nextReviewDate: addDays(date, 1),
            updatedAt: now,
          };
      notes.set(id, updated);
      return copy(updated);
    },
    deleteNote: async (id) => {
      mustGet(id);
      notes.delete(id);
    },
    getReviewQueue: async (date, limit) => {
      parseDate(date);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        fail("Validation", "Review queue limit must be between 1 and 50");
      const due = [...notes.values()]
        .filter(
          (note) => !note.archivedAt && note.nextReviewDate !== null && note.nextReviewDate <= date,
        )
        .sort((a, b) => a.nextReviewDate!.localeCompare(b.nextReviewDate!) || a.id - b.id);
      return { due: due.slice(0, limit).map(copy), dueCount: due.length };
    },
  };
}
