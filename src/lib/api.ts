import { invoke } from "@tauri-apps/api/core";

import { createMockApi } from "./mock-api";
import type { ErrorPayload, Habit, HabitPatch, NewHabit, TodayHabit } from "./types";

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
