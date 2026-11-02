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
import { Checkbox } from "@/components/ui/checkbox";
import { addDays } from "@/lib/date";
import { errorMessage } from "@/lib/api";
import { useDeleteReminder, useSetReminderDone, useUpdateReminder } from "@/lib/queries";
import type { Reminder } from "@/lib/types";

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function shortDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ReminderItem({
  reminder,
  today,
  onEdit,
}: {
  reminder: Reminder;
  today: string;
  onEdit?: (reminder: Reminder) => void;
}) {
  const toggle = useSetReminderDone();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = reminder.completedOn !== null;

  const snooze = () =>
    update.mutate(
      { id: reminder.id, patch: { dueDate: addDays(today, 1), dueTime: "" } },
      {
        onSuccess: () => toast.success("Reminder snoozed until tomorrow"),
        onError: (error) => toast.error(`Couldn't snooze reminder: ${errorMessage(error)}`),
      },
    );

  return (
    <>
      <li className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50">
        <Checkbox
          aria-label={`${done ? "Uncomplete" : "Complete"} reminder: ${reminder.title}`}
          checked={done}
          onCheckedChange={(checked) =>
            toggle.mutate({ id: reminder.id, today, done: checked === true })
          }
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${done ? "text-muted-foreground line-through" : ""}`}>
            {reminder.title}
          </p>
          {reminder.notes && (
            <p className="truncate text-xs text-muted-foreground">{reminder.notes}</p>
          )}
        </div>
        {reminder.dueTime && (
          <time className="shrink-0 text-xs text-muted-foreground">
            {formatTime(reminder.dueTime)}
          </time>
        )}
        {reminder.dueDate !== today && (
          <time
            className={`shrink-0 text-xs ${reminder.dueDate < today ? "text-destructive" : "text-muted-foreground"}`}
          >
            {shortDate(reminder.dueDate)}
          </time>
        )}
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {!done && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={snooze}
              aria-label={`Snooze ${reminder.title} until tomorrow`}
            >
              Snooze
            </Button>
          )}
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => onEdit(reminder)}
              aria-label={`Edit ${reminder.title}`}
            >
              Edit
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${reminder.title}`}
          >
            Delete
          </Button>
        </div>
      </li>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              “{reminder.title}” will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(reminder.id, {
                  onSuccess: () => {
                    toast.success("Reminder deleted");
                    setConfirmDelete(false);
                  },
                  onError: (error) =>
                    toast.error(`Couldn't delete reminder: ${errorMessage(error)}`),
                })
              }
            >
              Delete reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
