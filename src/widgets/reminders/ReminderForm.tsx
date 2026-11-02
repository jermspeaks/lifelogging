import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, isApiError } from "@/lib/api";
import { useCreateReminder, useUpdateReminder } from "@/lib/queries";
import type { NewReminder, Reminder } from "@/lib/types";

const TITLE_MAX = 200;
const NOTES_MAX = 1_000;

type Values = { title: string; notes: string; dueDate: string; dueTime: string };
type FieldErrors = Partial<Record<keyof Values, string>>;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  );
}

function validate(values: Values): FieldErrors {
  const errors: FieldErrors = {};
  const titleLength = Array.from(values.title.trim()).length;
  if (titleLength === 0) errors.title = "Title is required.";
  else if (titleLength > TITLE_MAX) errors.title = `Title must be at most ${TITLE_MAX} characters.`;
  if (Array.from(values.notes.trim()).length > NOTES_MAX)
    errors.notes = `Notes must be at most ${NOTES_MAX} characters.`;
  if (!validDate(values.dueDate)) errors.dueDate = "Choose a valid date.";
  if (values.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.dueTime))
    errors.dueTime = "Choose a valid time.";
  return errors;
}

export function ReminderFormDialog({
  open,
  onOpenChange,
  today,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  reminder?: Reminder | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
          <DialogDescription>
            Choose when this reminder is due. Reminders stay in this app and do not repeat.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ReminderForm
            key={`${reminder?.id ?? "new"}-${reminder?.updatedAt ?? today}`}
            reminder={reminder ?? undefined}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({
  reminder,
  today,
  onDone,
}: {
  reminder?: Reminder;
  today: string;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Values>(() => ({
    title: reminder?.title ?? "",
    notes: reminder?.notes ?? "",
    dueDate: reminder?.dueDate ?? today,
    dueTime: reminder?.dueTime ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const pending = create.isPending || update.isPending;
  const errors = submitted ? validate(values) : {};

  const set = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerError(null);
  };

  const onError = (error: unknown) => {
    if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
    else toast.error(`Couldn't save reminder: ${errorMessage(error)}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(values)).length > 0) return;

    const input: NewReminder = {
      title: values.title.trim(),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      dueDate: values.dueDate,
      ...(values.dueTime ? { dueTime: values.dueTime } : {}),
    };
    if (reminder) {
      update.mutate(
        {
          id: reminder.id,
          patch: {
            title: input.title,
            notes: values.notes.trim(),
            dueDate: input.dueDate,
            dueTime: values.dueTime,
          },
        },
        { onSuccess: onDone, onError },
      );
    } else {
      create.mutate(input, { onSuccess: onDone, onError });
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="reminder-title">Title</Label>
        <Input
          id="reminder-title"
          autoFocus
          maxLength={TITLE_MAX + 10}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          aria-invalid={!!errors.title || undefined}
          aria-describedby={errors.title ? "reminder-title-error" : undefined}
        />
        {errors.title && (
          <p id="reminder-title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reminder-notes">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="reminder-notes"
          rows={3}
          value={values.notes}
          onChange={(event) => set("notes", event.target.value)}
          aria-invalid={!!errors.notes || undefined}
          aria-describedby={errors.notes ? "reminder-notes-error" : undefined}
        />
        {errors.notes && (
          <p id="reminder-notes-error" className="text-sm text-destructive">
            {errors.notes}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="reminder-date">Due date</Label>
          <Input
            id="reminder-date"
            type="date"
            value={values.dueDate}
            onChange={(event) => set("dueDate", event.target.value)}
            aria-invalid={!!errors.dueDate || undefined}
            aria-describedby={errors.dueDate ? "reminder-date-error" : undefined}
          />
          {errors.dueDate && (
            <p id="reminder-date-error" className="text-sm text-destructive">
              {errors.dueDate}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reminder-time">
            Time <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="reminder-time"
            type="time"
            value={values.dueTime}
            onChange={(event) => set("dueTime", event.target.value)}
            aria-invalid={!!errors.dueTime || undefined}
            aria-describedby={errors.dueTime ? "reminder-time-error" : undefined}
          />
          {errors.dueTime && (
            <p id="reminder-time-error" className="text-sm text-destructive">
              {errors.dueTime}
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : reminder ? "Save reminder" : "Add reminder"}
        </Button>
      </DialogFooter>
    </form>
  );
}
