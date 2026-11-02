import { invoke } from "@tauri-apps/api/core";

import { createMockApi } from "./mock-api";
import type {
  Calendar,
  CalendarEvent,
  DataInfo,
  ErrorPayload,
  ExportResult,
  Habit,
  HabitPatch,
  ImportCalendarResult,
  ImportQuotesResult,
  JournalEntry,
  JournalSummary,
  NewHabit,
  NewNote,
  NewGoal,
  NewReminder,
  NewQuote,
  Quote,
  QuotePatch,
  Goal,
  GoalPatch,
  GoalStatus,
  GoalSummary,
  Note,
  NotePatch,
  Reminder,
  ReminderPatch,
  ReviewAction,
  ReviewQueue,
  ThemeInput,
  AnnualTheme,
  TodayHabit,
} from "./types";

/** One typed function per Tauri command (SPEC §7). Dates are local `YYYY-MM-DD`. */
export interface Api {
  listHabits(includeArchived: boolean): Promise<Habit[]>;
  getHabit(id: number): Promise<Habit>;
  createHabit(input: NewHabit): Promise<Habit>;
  updateHabit(id: number, patch: HabitPatch): Promise<Habit>;
  archiveHabit(id: number): Promise<Habit>;
  unarchiveHabit(id: number): Promise<Habit>;
  deleteHabit(id: number): Promise<void>;
  reorderHabits(ids: number[]): Promise<void>;
  setHabitCheck(habitId: number, date: string, today: string, done: boolean): Promise<TodayHabit>;
  getToday(today: string): Promise<TodayHabit[]>;
  listCalendars(): Promise<Calendar[]>;
  importCalendar(name: string, content: string): Promise<ImportCalendarResult>;
  deleteCalendar(id: number): Promise<void>;
  getUpcomingEvents(today: string): Promise<CalendarEvent[]>;
  getJournalEntry(date: string, today: string): Promise<JournalEntry | null>;
  saveJournalEntry(date: string, today: string, body: string): Promise<JournalEntry | null>;
  deleteJournalEntry(date: string): Promise<void>;
  listJournalEntries(query?: string, before?: string, limit?: number): Promise<JournalSummary[]>;
  listThemes(): Promise<AnnualTheme[]>;
  getTheme(year: number): Promise<AnnualTheme | null>;
  setTheme(year: number, input: ThemeInput): Promise<AnnualTheme>;
  deleteTheme(year: number): Promise<void>;
  listQuotes(): Promise<Quote[]>;
  createQuote(input: NewQuote): Promise<Quote>;
  updateQuote(id: number, patch: QuotePatch): Promise<Quote>;
  deleteQuote(id: number): Promise<void>;
  importQuotes(text: string): Promise<ImportQuotesResult>;
  getDailyQuote(today: string): Promise<Quote | null>;
  getDataInfo(): Promise<DataInfo>;
  exportDatabase(path: string): Promise<ExportResult>;
  exportJson(path: string): Promise<ExportResult>;
  listReminders(today: string, includeCompleted: boolean): Promise<Reminder[]>;
  getDueReminders(today: string): Promise<Reminder[]>;
  createReminder(input: NewReminder): Promise<Reminder>;
  updateReminder(id: number, patch: ReminderPatch): Promise<Reminder>;
  setReminderDone(id: number, today: string, done: boolean): Promise<Reminder>;
  deleteReminder(id: number): Promise<void>;
  listNotes(query: string | undefined, includeArchived: boolean): Promise<Note[]>;
  createNote(input: NewNote, today: string): Promise<Note>;
  updateNote(id: number, patch: NotePatch): Promise<Note>;
  reviewNote(id: number, today: string, action: ReviewAction): Promise<Note>;
  setNoteArchived(id: number, archived: boolean, today: string): Promise<Note>;
  deleteNote(id: number): Promise<void>;
  getReviewQueue(today: string, limit: number): Promise<ReviewQueue>;
  listGoals(today: string, includeClosed: boolean): Promise<GoalSummary[]>;
  createGoal(input: NewGoal): Promise<Goal>;
  updateGoal(id: number, patch: GoalPatch): Promise<Goal>;
  setGoalStatus(id: number, status: GoalStatus, today: string): Promise<Goal>;
  deleteGoal(id: number): Promise<void>;
  reorderGoals(ids: number[]): Promise<void>;
  logGoalProgress(
    goalId: number,
    date: string,
    today: string,
    amount: number,
  ): Promise<GoalSummary>;
}

const tauriApi: Api = {
  listHabits: (includeArchived) => invoke("list_habits", { includeArchived }),
  getHabit: (id) => invoke("get_habit", { id }),
  createHabit: (input) => invoke("create_habit", { input }),
  updateHabit: (id, patch) => invoke("update_habit", { id, patch }),
  archiveHabit: (id) => invoke("archive_habit", { id }),
  unarchiveHabit: (id) => invoke("unarchive_habit", { id }),
  deleteHabit: (id) => invoke("delete_habit", { id }),
  reorderHabits: (ids) => invoke("reorder_habits", { ids }),
  setHabitCheck: (habitId, date, today, done) =>
    invoke("set_habit_check", { habitId, date, today, done }),
  getToday: (today) => invoke("get_today", { today }),
  listCalendars: () => invoke("list_calendars"),
  importCalendar: (name, content) => invoke("import_calendar", { name, content }),
  deleteCalendar: (id) => invoke("delete_calendar", { id }),
  getUpcomingEvents: (today) => invoke("get_upcoming_events", { today }),
  getJournalEntry: (date, today) => invoke("get_journal_entry", { date, today }),
  saveJournalEntry: (date, today, body) => invoke("save_journal_entry", { date, today, body }),
  deleteJournalEntry: (date) => invoke("delete_journal_entry", { date }),
  listJournalEntries: (query, before, limit) =>
    invoke("list_journal_entries", { query, before, limit }),
  listThemes: () => invoke("list_themes"),
  getTheme: (year) => invoke("get_theme", { year }),
  setTheme: (year, input) => invoke("set_theme", { year, input }),
  deleteTheme: (year) => invoke("delete_theme", { year }),
  listQuotes: () => invoke("list_quotes"),
  createQuote: (input) => invoke("create_quote", { input }),
  updateQuote: (id, patch) => invoke("update_quote", { id, patch }),
  deleteQuote: (id) => invoke("delete_quote", { id }),
  importQuotes: (text) => invoke("import_quotes", { text }),
  getDailyQuote: (today) => invoke("get_daily_quote", { today }),
  getDataInfo: () => invoke("get_data_info"),
  exportDatabase: (path) => invoke("export_database", { path }),
  exportJson: (path) => invoke("export_json", { path }),
  listReminders: (today, includeCompleted) => invoke("list_reminders", { today, includeCompleted }),
  getDueReminders: (today) => invoke("get_due_reminders", { today }),
  createReminder: (input) => invoke("create_reminder", { input }),
  updateReminder: (id, patch) => invoke("update_reminder", { id, patch }),
  setReminderDone: (id, today, done) => invoke("set_reminder_done", { id, today, done }),
  deleteReminder: (id) => invoke("delete_reminder", { id }),
  listNotes: (query, includeArchived) => invoke("list_notes", { query, includeArchived }),
  createNote: (input, today) => invoke("create_note", { input, today }),
  updateNote: (id, patch) => invoke("update_note", { id, patch }),
  reviewNote: (id, today, action) => invoke("review_note", { id, today, action }),
  setNoteArchived: (id, archived, today) => invoke("set_note_archived", { id, archived, today }),
  deleteNote: (id) => invoke("delete_note", { id }),
  getReviewQueue: (today, limit) => invoke("get_review_queue", { today, limit }),
  listGoals: (today, includeClosed) => invoke("list_goals", { today, includeClosed }),
  createGoal: (input) => invoke("create_goal", { input }),
  updateGoal: (id, patch) => invoke("update_goal", { id, patch }),
  setGoalStatus: (id, status, today) => invoke("set_goal_status", { id, status, today }),
  deleteGoal: (id) => invoke("delete_goal", { id }),
  reorderGoals: (ids) => invoke("reorder_goals", { ids }),
  logGoalProgress: (goalId, date, today, amount) =>
    invoke("log_goal_progress", { goalId, date, today, amount }),
};

/** `VITE_MOCK_API=1 npm run dev` runs the UI in a plain browser against an in-memory backend. */
export const api: Api = import.meta.env.VITE_MOCK_API === "1" ? createMockApi() : tauriApi;

export function isApiError(e: unknown): e is ErrorPayload {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}

export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
