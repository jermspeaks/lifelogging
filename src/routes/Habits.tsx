import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useHabits } from "@/lib/queries";
import type { Habit } from "@/lib/types";
import { HabitFormDialog } from "@/widgets/habits/HabitForm";
import { ArchivedHabits, HabitList } from "@/widgets/habits/HabitList";

/** `habit` null = create, a habit = edit. Kept while closing so the title doesn't flicker. */
type DialogState = { open: boolean; habit: Habit | null };

export default function Habits() {
  const { data: habits, isPending, error } = useHabits(true);
  const [dialog, setDialog] = useState<DialogState>({ open: false, habit: null });
  const openNew = () => setDialog({ open: true, habit: null });

  // ⌘N / Ctrl+N opens the "New habit" dialog.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setDialog((d) => (d.open ? d : { open: true, habit: null }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const active = (habits ?? [])
    .filter((h) => !h.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = (habits ?? []).filter((h) => h.archivedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">
            Add, edit, reorder and archive the habits on your dashboard.
          </p>
        </div>
        <Button onClick={openNew} title="New habit (⌘N)">
          <Plus />
          New habit
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load habits: {errorMessage(error)}
        </p>
      ) : (
        <>
          {active.length > 0 ? (
            <HabitList habits={active} onEdit={(habit) => setDialog({ open: true, habit })} />
          ) : (
            <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="font-medium">No active habits</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create one to start tracking it on the Today dashboard.
              </p>
              <Button className="mt-4" variant="outline" onClick={openNew}>
                <Plus />
                New habit
              </Button>
            </div>
          )}
          <ArchivedHabits habits={archived} />
        </>
      )}

      <HabitFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        habit={dialog.habit}
      />
    </div>
  );
}
