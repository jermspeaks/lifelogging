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
import { useCreateGoal, useUpdateGoal } from "@/lib/queries";
import type { Goal, NewGoal } from "@/lib/types";

type FormValues = {
  title: string;
  description: string;
  trackNumber: boolean;
  targetValue: string;
  unit: string;
  dueDate: string;
};
type FormErrors = Partial<Record<keyof FormValues, string>>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  const titleLength = Array.from(values.title.trim()).length;
  if (titleLength === 0 || titleLength > 120) errors.title = "Title must be 1–120 characters.";
  if (Array.from(values.description.trim()).length > 1000)
    errors.description = "Description must be at most 1,000 characters.";
  if (values.trackNumber) {
    const target = Number(values.targetValue);
    if (!values.targetValue || !Number.isFinite(target) || target <= 0)
      errors.targetValue = "Enter a target greater than 0.";
    if (Array.from(values.unit.trim()).length > 20)
      errors.unit = "Unit must be at most 20 characters.";
  }
  if (values.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.dueDate))
    errors.dueDate = "Choose a valid due date.";
  return errors;
}

export function GoalFormDialog({ open, onOpenChange, goal }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
          <DialogDescription>
            {goal
              ? "Update the details and target for this goal."
              : "Choose a milestone or track progress toward a number."}
          </DialogDescription>
        </DialogHeader>
        <GoalForm
          key={`${open}-${goal?.id ?? "new"}`}
          goal={goal ?? undefined}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const [values, setValues] = useState<FormValues>(() => ({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    trackNumber: goal?.targetValue !== null && goal?.targetValue !== undefined,
    targetValue: goal?.targetValue?.toString() ?? "",
    unit: goal?.unit ?? "",
    dueDate: goal?.dueDate ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const pending = create.isPending || update.isPending;
  const errors = submitted ? validate(values) : {};

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerError(null);
  };

  const onError = (error: unknown) => {
    if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
    else toast.error(`Couldn't save goal: ${errorMessage(error)}`);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(values)).length > 0) return;
    const title = values.title.trim();
    const description = values.description.trim();
    const unit = values.trackNumber ? values.unit.trim() : "";
    const dueDate = values.dueDate.trim();
    const targetValue = values.trackNumber ? Number(values.targetValue) : null;
    if (goal) {
      update.mutate(
        {
          id: goal.id,
          patch: {
            title,
            description,
            targetValue,
            unit,
            dueDate,
          },
        },
        { onSuccess: onDone, onError },
      );
    } else {
      const input: NewGoal = {
        title,
        ...(values.trackNumber ? { targetValue: Number(values.targetValue) } : {}),
        ...(values.trackNumber && unit ? { unit } : {}),
        ...(description ? { description } : {}),
        ...(dueDate ? { dueDate } : {}),
      };
      create.mutate(input, { onSuccess: onDone, onError });
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
        <Label htmlFor="goal-title">Title</Label>
        <Input
          id="goal-title"
          autoFocus
          maxLength={120}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="e.g. Read 24 books"
          aria-invalid={!!errors.title || undefined}
          aria-describedby={errors.title ? "goal-title-error" : undefined}
        />
        {errors.title && (
          <p id="goal-title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="goal-description">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="goal-description"
          maxLength={1000}
          rows={3}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          aria-invalid={!!errors.description || undefined}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <input
          id="goal-track-number"
          type="checkbox"
          role="switch"
          checked={values.trackNumber}
          onChange={(event) => set("trackNumber", event.target.checked)}
          className="size-4 accent-primary"
        />
        <Label htmlFor="goal-track-number">Track a number</Label>
      </div>
      {values.trackNumber && (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="goal-target">Target</Label>
            <Input
              id="goal-target"
              type="number"
              min="0"
              step="any"
              value={values.targetValue}
              onChange={(event) => set("targetValue", event.target.value)}
              aria-invalid={!!errors.targetValue || undefined}
              aria-describedby={errors.targetValue ? "goal-target-error" : undefined}
            />
            {errors.targetValue && (
              <p id="goal-target-error" className="col-span-2 text-sm text-destructive">
                {errors.targetValue}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="goal-unit">
              Unit <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="goal-unit"
              maxLength={20}
              value={values.unit}
              onChange={(event) => set("unit", event.target.value)}
              placeholder="books"
              aria-invalid={!!errors.unit || undefined}
              aria-describedby={errors.unit ? "goal-unit-error" : undefined}
            />
            {errors.unit && (
              <p id="goal-unit-error" className="text-sm text-destructive">
                {errors.unit}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="goal-due-date">
          Due date <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="goal-due-date"
          type="date"
          value={values.dueDate}
          onChange={(event) => set("dueDate", event.target.value)}
          aria-invalid={!!errors.dueDate || undefined}
        />
        {errors.dueDate && <p className="text-sm text-destructive">{errors.dueDate}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : goal ? "Save" : "Create goal"}
        </Button>
      </DialogFooter>
    </form>
  );
}
