import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, errorMessage } from "./api";
import type { HabitPatch, NewHabit, NewQuote, QuotePatch, ThemeInput, TodayHabit } from "./types";

export const queryKeys = {
  habits: (includeArchived: boolean) => ["habits", { includeArchived }] as const,
  today: (date: string) => ["today", date] as const,
  calendars: ["calendars"] as const,
  events: (date: string) => ["events", date] as const,
  journal: ["journal"] as const,
  journalEntry: (date: string) => ["journal", "entry", date] as const,
  journalList: (query?: string, before?: string, limit?: number) =>
    ["journal", "list", { query, before, limit }] as const,
  themes: ["themes"] as const,
  theme: (year: number) => ["themes", year] as const,
  quotes: ["quotes"] as const,
  dailyQuote: (date: string) => ["quotes", "daily", date] as const,
  dataInfo: ["data-info"] as const,
};

/** Every habit mutation can change both the manage list and the dashboard. */
function useInvalidateHabits() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["habits"] }),
      qc.invalidateQueries({ queryKey: ["today"] }),
    ]);
}

export function useHabits(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.habits(includeArchived),
    queryFn: () => api.listHabits(includeArchived),
  });
}

export function useTodayHabits(today: string) {
  return useQuery({
    queryKey: queryKeys.today(today),
    queryFn: () => api.getToday(today),
  });
}

export function useCalendars() {
  return useQuery({ queryKey: queryKeys.calendars, queryFn: () => api.listCalendars() });
}

export function useUpcomingEvents(today: string) {
  return useQuery({
    queryKey: queryKeys.events(today),
    queryFn: () => api.getUpcomingEvents(today),
  });
}

function useInvalidateCalendarData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.calendars }),
      qc.invalidateQueries({ queryKey: ["events"] }),
    ]);
}

export function useImportCalendar() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      api.importCalendar(name, content),
    onSettled: invalidate,
  });
}

export function useDeleteCalendar() {
  const invalidate = useInvalidateCalendarData();
  return useMutation({ mutationFn: (id: number) => api.deleteCalendar(id), onSettled: invalidate });
}

export function useCreateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (input: NewHabit) => api.createHabit(input),
    onSettled: invalidate,
  });
}

export function useUpdateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: HabitPatch }) => api.updateHabit(id, patch),
    onSettled: invalidate,
  });
}

export function useArchiveHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (id: number) => api.archiveHabit(id),
    onSettled: invalidate,
  });
}

export function useUnarchiveHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (id: number) => api.unarchiveHabit(id),
    onSettled: invalidate,
  });
}

export function useDeleteHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (id: number) => api.deleteHabit(id),
    onSettled: invalidate,
  });
}

export function useReorderHabits() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (ids: number[]) => api.reorderHabits(ids),
    onSettled: invalidate,
  });
}

type SetCheckVars = { habitId: number; date: string; today: string; done: boolean };

/**
 * Optimistically flips `doneToday` in the Today cache, rolls back and toasts on error,
 * then refetches so streaks / the 7-day strip come from the backend.
 */
export function useJournalEntry(date: string, today: string) {
  return useQuery({
    queryKey: queryKeys.journalEntry(date),
    queryFn: () => api.getJournalEntry(date, today),
  });
}

export function useJournalEntries(query?: string, before?: string, limit?: number) {
  return useQuery({
    queryKey: queryKeys.journalList(query, before, limit),
    queryFn: () => api.listJournalEntries(query, before, limit),
  });
}

export function useSaveJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, today, body }: { date: string; today: string; body: string }) =>
      api.saveJournalEntry(date, today, body),
    onSettled: (_data, _error, variables) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.journal }),
        qc.invalidateQueries({ queryKey: queryKeys.journalEntry(variables.date) }),
      ]),
  });
}

export function useDeleteJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.deleteJournalEntry(date),
    onSettled: (_data, _error, date) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.journal }),
        qc.invalidateQueries({ queryKey: queryKeys.journalEntry(date) }),
      ]),
  });
}

export function useThemes() {
  return useQuery({ queryKey: queryKeys.themes, queryFn: () => api.listThemes() });
}

export function useTheme(year: number) {
  return useQuery({ queryKey: queryKeys.theme(year), queryFn: () => api.getTheme(year) });
}

export function useSetTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, input }: { year: number; input: ThemeInput }) => api.setTheme(year, input),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.themes }),
  });
}

export function useDeleteTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => api.deleteTheme(year),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.themes }),
  });
}

export function useQuotes() {
  return useQuery({ queryKey: queryKeys.quotes, queryFn: () => api.listQuotes() });
}

export function useDailyQuote(today: string) {
  return useQuery({
    queryKey: queryKeys.dailyQuote(today),
    queryFn: () => api.getDailyQuote(today),
  });
}

function useInvalidateQuotes() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.quotes }),
      qc.invalidateQueries({ queryKey: ["quotes", "daily"] }),
    ]);
}

export function useCreateQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: (input: NewQuote) => api.createQuote(input),
    onSettled: invalidate,
  });
}

export function useUpdateQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: QuotePatch }) => api.updateQuote(id, patch),
    onSettled: invalidate,
  });
}

export function useDeleteQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({ mutationFn: (id: number) => api.deleteQuote(id), onSettled: invalidate });
}

export function useImportQuotes() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: (text: string) => api.importQuotes(text),
    onSettled: invalidate,
  });
}

export function useDataInfo() {
  return useQuery({ queryKey: queryKeys.dataInfo, queryFn: () => api.getDataInfo() });
}

export function useExportDatabase() {
  return useMutation({ mutationFn: (path: string) => api.exportDatabase(path) });
}

export function useExportJson() {
  return useMutation({ mutationFn: (path: string) => api.exportJson(path) });
}

export function useSetHabitCheck() {
  const qc = useQueryClient();
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: ({ habitId, date, today, done }: SetCheckVars) =>
      api.setHabitCheck(habitId, date, today, done),
    onMutate: async ({ habitId, date, today, done }) => {
      const key = queryKeys.today(today);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TodayHabit[]>(key);
      if (date === today) {
        qc.setQueryData<TodayHabit[]>(key, (rows) =>
          rows?.map((r) => (r.habit.id === habitId ? { ...r, doneToday: done } : r)),
        );
      }
      return { previous, key };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.previous);
      toast.error(`Couldn't update habit: ${errorMessage(err)}`);
    },
    onSettled: invalidate,
  });
}
