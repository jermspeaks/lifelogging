import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, errorMessage } from "./api";
import type { HabitPatch, NewHabit, TodayHabit } from "./types";

export const queryKeys = {
  habits: (includeArchived: boolean) => ["habits", { includeArchived }] as const,
  today: (date: string) => ["today", date] as const,
  calendarSources: ["calendarSources"] as const,
  upcomingEvents: (date: string) => ["upcomingEvents", date] as const,
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

export function useCalendarSources() {
  return useQuery({
    queryKey: queryKeys.calendarSources,
    queryFn: () => api.listCalendarSources(),
  });
}

export function useUpcomingEvents(today: string) {
  return useQuery({
    queryKey: queryKeys.upcomingEvents(today),
    queryFn: () => api.getUpcomingEvents(today),
  });
}

function useInvalidateCalendars() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.calendarSources }),
      qc.invalidateQueries({ queryKey: ["upcomingEvents"] }),
    ]);
}

export function useImportCalendar() {
  const invalidate = useInvalidateCalendars();
  return useMutation({
    mutationFn: ({
      name,
      content,
      sourceId,
    }: {
      name: string;
      content: string;
      sourceId?: number;
    }) => api.importCalendar(name, content, sourceId),
    onSettled: invalidate,
  });
}

export function useDeleteCalendar() {
  const invalidate = useInvalidateCalendars();
  return useMutation({
    mutationFn: (sourceId: number) => api.deleteCalendar(sourceId),
    onSettled: invalidate,
  });
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
