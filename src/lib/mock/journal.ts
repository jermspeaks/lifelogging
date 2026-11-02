import type { Api } from "../api";
import { addDays, todayLocal } from "../date";
import type { ErrorPayload, JournalEntry, JournalSummary } from "../types";

type JournalApi = Pick<
  Api,
  "getJournalEntry" | "saveJournalEntry" | "deleteJournalEntry" | "listJournalEntries"
>;

const MAX_BODY_LENGTH = 100_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function fail(message: string): never {
  throw { kind: "Validation", message } satisfies ErrorPayload;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function validateDate(date: string, today?: string) {
  if (!isDate(date)) fail("Date must be a valid YYYY-MM-DD date.");
  if (today !== undefined) {
    if (!isDate(today)) fail("Date must be a valid YYYY-MM-DD date.");
    if (date > today) fail("Journal date cannot be in the future.");
  }
}

function wordCount(body: string): number {
  return body.trim() ? body.trim().split(/\s+/u).length : 0;
}

function preview(body: string): string {
  const collapsed = body.replace(/\s+/gu, " ").trim();
  const chars = Array.from(collapsed);
  return chars.length > 160 ? `${chars.slice(0, 159).join("")}…` : collapsed;
}

function makeEntry(date: string, body: string, timestamp: string): JournalEntry {
  return { date, body, wordCount: wordCount(body), createdAt: timestamp, updatedAt: timestamp };
}

export function createJournalMock(): JournalApi {
  const today = todayLocal();
  const entries = new Map<string, JournalEntry>();
  for (const [offset, body] of [
    [-1, "A quiet day with a good walk and a little time to read."],
    [-3, "Made progress on a project and caught up with a friend."],
    [-7, "A fresh week. I want to make room for the things that matter."],
  ] as const) {
    const date = addDays(today, offset);
    entries.set(date, makeEntry(date, body, `${date}T20:00:00.000Z`));
  }

  return {
    getJournalEntry: async (date, currentDay) => {
      validateDate(date, currentDay);
      const entry = entries.get(date);
      return entry ? { ...entry } : null;
    },
    saveJournalEntry: async (date, currentDay, body) => {
      validateDate(date, currentDay);
      if (Array.from(body).length > MAX_BODY_LENGTH)
        fail(`Journal entry must be at most ${MAX_BODY_LENGTH} characters.`);
      if (!body.trim()) {
        entries.delete(date);
        return null;
      }
      const existing = entries.get(date);
      const updatedAt = new Date().toISOString();
      const entry: JournalEntry = {
        date,
        body,
        wordCount: wordCount(body),
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
      };
      entries.set(date, entry);
      return { ...entry };
    },
    deleteJournalEntry: async (date) => {
      validateDate(date);
      entries.delete(date);
    },
    listJournalEntries: async (query, before, limit = DEFAULT_LIMIT) => {
      if (before !== undefined) validateDate(before);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
        fail(`Journal list limit must be between 1 and ${MAX_LIMIT}.`);
      const needle = query?.trim() ? query.toLowerCase() : null;
      return [...entries.values()]
        .filter((entry) => before === undefined || entry.date < before)
        .filter((entry) => needle === null || entry.body.toLowerCase().includes(needle))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((entry): JournalSummary => ({
          date: entry.date,
          preview: preview(entry.body),
          wordCount: entry.wordCount,
          updatedAt: entry.updatedAt,
        }));
    },
  };
}
