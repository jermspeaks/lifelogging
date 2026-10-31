import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { errorMessage } from "@/lib/api";
import {
  queryKeys,
  useArchiveHabit,
  useDeleteHabit,
  useReorderHabits,
  useUnarchiveHabit,
} from "@/lib/queries";
import type { Habit } from "@/lib/types";
import { cn } from "@/lib/utils";

import { habitColorClasses } from "./colors";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function scheduleLabel(mask: number): string {
  if (mask === 127) return "Every day";
  if (mask === 31) return "Weekdays";
  if (mask === 96) return "Weekends";
  return DAY_NAMES.filter((_, i) => (mask & (1 << i)) !== 0).join(", ");
}

function HabitSummary({ habit }: { habit: Habit }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <span
        aria-hidden
        className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", habitColorClasses[habit.color].dot)}
      />
      <div className="min-w-0">
        <div className="truncate font-medium">{habit.name}</div>
        <div className="truncate text-sm text-muted-foreground">
          {scheduleLabel(habit.scheduleDays)}
          {habit.description && <> · {habit.description}</>}
        </div>
      </div>
    </div>
  );
}

type ActiveProps = {
  /** Active habits in display (sort_order) order. */
  habits: Habit[];
  onEdit: (habit: Habit) => void;
};

export function HabitList({ habits, onEdit }: ActiveProps) {
  const qc = useQueryClient();
  const reorder = useReorderHabits();
  const archive = useArchiveHabit();
  const unarchive = useUnarchiveHabit();

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= habits.length) return;
    const next = [...habits];
    [next[index], next[target]] = [next[target], next[index]];
    // Optimistic: reflect the new order in the cached list immediately; the hook refetches after.
    const order = new Map(next.map((h, i) => [h.id, i]));
    for (const includeArchived of [false, true]) {
      qc.setQueryData<Habit[]>(queryKeys.habits(includeArchived), (rows) =>
        rows
          ? [...rows].sort(
              (a, b) =>
                (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
            )
          : rows,
      );
    }
    reorder.mutate(
      next.map((h) => h.id),
      { onError: (e) => toast.error(`Couldn't reorder habits: ${errorMessage(e)}`) },
    );
  };

  return (
    <ul className="divide-y rounded-lg border">
      {habits.map((habit, i) => (
        <li key={habit.id} className="flex items-center gap-3 px-4 py-3">
          <HabitSummary habit={habit} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${habit.name} up`}
              title="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${habit.name} down`}
              title="Move down"
              disabled={i === habits.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${habit.name}`}
              title="Edit"
              onClick={() => onEdit(habit)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Archive ${habit.name}`}
              title="Archive"
              onClick={() =>
                archive.mutate(habit.id, {
                  onSuccess: () =>
                    toast.success(`Archived “${habit.name}”`, {
                      action: {
                        label: "Undo",
                        onClick: () =>
                          unarchive.mutate(habit.id, {
                            onError: (e) =>
                              toast.error(`Couldn't unarchive habit: ${errorMessage(e)}`),
                          }),
                      },
                    }),
                  onError: (e) => toast.error(`Couldn't archive habit: ${errorMessage(e)}`),
                })
              }
            >
              <Archive />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ArchivedHabits({ habits }: { habits: Habit[] }) {
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Habit | null>(null);
  const unarchive = useUnarchiveHabit();
  const remove = useDeleteHabit();

  if (habits.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          Archived ({habits.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y rounded-lg border">
          {habits.map((habit) => (
            <li key={habit.id} className="flex items-center gap-3 px-4 py-3 opacity-80">
              <HabitSummary habit={habit} />
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Unarchive ${habit.name}`}
                  onClick={() =>
                    unarchive.mutate(habit.id, {
                      onError: (e) => toast.error(`Couldn't unarchive habit: ${errorMessage(e)}`),
                    })
                  }
                >
                  <ArchiveRestore />
                  Unarchive
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${habit.name}`}
                  onClick={() => setToDelete(habit)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete <em>{toDelete?.name}</em> and all its history?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the habit and every check-in. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!toDelete) return;
                const { id, name } = toDelete;
                remove.mutate(id, {
                  onSuccess: () => toast.success(`Deleted “${name}”`),
                  onError: (e) => toast.error(`Couldn't delete habit: ${errorMessage(e)}`),
                });
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
}
