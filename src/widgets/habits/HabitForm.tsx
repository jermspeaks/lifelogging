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
import { useCreateHabit, useUpdateHabit } from "@/lib/queries";
import type { Habit, HabitColor } from "@/lib/types";

import { ColorPicker } from "./ColorPicker";
import { EVERY_DAY_MASK, WeekdayPicker } from "./WeekdayPicker";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

type Values = { name: string; description: string; color: HabitColor; scheduleDays: number };
type Errors = Partial<Record<"name" | "description" | "scheduleDays", string>>;

/** Client-side mirror of the backend rules (SPEC §5/§6). */
function validate(v: Values): Errors {
  const errors: Errors = {};
  const name = v.name.trim();
  if (name.length === 0) errors.name = "Name is required";
  else if (name.length > NAME_MAX) errors.name = `Name must be at most ${NAME_MAX} characters`;
  if (v.description.trim().length > DESCRIPTION_MAX)
    errors.description = `Description must be at most ${DESCRIPTION_MAX} characters`;
  if (v.scheduleDays < 1 || v.scheduleDays > EVERY_DAY_MASK)
    errors.scheduleDays = "Pick at least one day";
  return errors;
}

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit (prefilled); absent → create. */
  habit?: Habit | null;
};

/** Create / edit dialog. The form remounts each time the dialog opens, so state starts fresh. */
export function HabitFormDialog({ open, onOpenChange, habit }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{habit ? "Edit habit" : "New habit"}</DialogTitle>
          <DialogDescription>
            {habit
              ? "Changes apply to the dashboard right away."
              : "Something you want to do regularly."}
          </DialogDescription>
        </DialogHeader>
        <HabitForm habit={habit ?? undefined} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { habit?: Habit; onDone: () => void };

export function HabitForm({ habit, onDone }: FormProps) {
  const [values, setValues] = useState<Values>(() => ({
    name: habit?.name ?? "",
    description: habit?.description ?? "",
    color: habit?.color ?? "slate",
    scheduleDays: habit?.scheduleDays ?? EVERY_DAY_MASK,
  }));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const pending = create.isPending || update.isPending;

  const errors = submitted ? validate(values) : {};
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setServerError(null);
  };

  const onError = (e: unknown) => {
    if (isApiError(e) && e.kind === "Validation") setServerError(e.message);
    else toast.error(`Couldn't save habit: ${errorMessage(e)}`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(values)).length > 0) return;

    const name = values.name.trim();
    const description = values.description.trim();
    const { color, scheduleDays } = values;
    if (habit) {
      // `""` clears the description (see `HabitPatch` in src-tauri/src/habits/model.rs).
      update.mutate(
        { id: habit.id, patch: { name, description, color, scheduleDays } },
        { onSuccess: onDone, onError },
      );
    } else {
      create.mutate(
        { name, color, scheduleDays, ...(description ? { description } : {}) },
        { onSuccess: onDone, onError },
      );
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="habit-name">Name</Label>
        <Input
          id="habit-name"
          autoFocus
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Read for 20 minutes"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? "habit-name-error" : undefined}
        />
        {errors.name && (
          <p id="habit-name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="habit-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {values.description.trim().length}/{DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          id="habit-description"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          aria-invalid={!!errors.description || undefined}
          aria-describedby={errors.description ? "habit-description-error" : undefined}
        />
        {errors.description && (
          <p id="habit-description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="habit-color">Color</Label>
        <ColorPicker id="habit-color" value={values.color} onChange={(c) => set("color", c)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="habit-days">Days</Label>
        <WeekdayPicker
          id="habit-days"
          value={values.scheduleDays}
          onChange={(m) => set("scheduleDays", m)}
          invalid={!!errors.scheduleDays}
          describedBy={errors.scheduleDays ? "habit-days-error" : undefined}
        />
        {errors.scheduleDays && (
          <p id="habit-days-error" className="text-sm text-destructive">
            {errors.scheduleDays}
          </p>
        )}
      </div>

      <DialogFooterButtons pending={pending} isEdit={!!habit} onCancel={onDone} />
    </form>
  );
}

function DialogFooterButtons({
  pending,
  isEdit,
  onCancel,
}: {
  pending: boolean;
  isEdit: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : isEdit ? "Save" : "Create habit"}
      </Button>
    </DialogFooter>
  );
}
