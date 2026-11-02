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
import { useSetTheme } from "@/lib/queries";
import type { AnnualTheme, ThemeInput } from "@/lib/types";

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;

type FieldErrors = Partial<Record<"year" | "title" | "description", string>>;

type ThemeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme?: AnnualTheme | null;
  initialYear: number;
  allowYearEdit?: boolean;
};

export function ThemeDialog({
  open,
  onOpenChange,
  theme,
  initialYear,
  allowYearEdit = false,
}: ThemeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{theme ? "Edit annual theme" : "Set annual theme"}</DialogTitle>
          <DialogDescription>
            Choose a focus for the year and add an optional description.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ThemeForm
            key={`${theme?.year ?? initialYear}-${theme?.updatedAt ?? "new"}`}
            theme={theme ?? undefined}
            initialYear={initialYear}
            allowYearEdit={allowYearEdit}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function validate(year: string, title: string, description: string, allowYearEdit: boolean) {
  const errors: FieldErrors = {};
  const parsedYear = Number(year);
  if (
    allowYearEdit &&
    (!/^\d{1,4}$/.test(year) ||
      !Number.isInteger(parsedYear) ||
      parsedYear < 1900 ||
      parsedYear > 9999)
  ) {
    errors.year = "Year must be between 1900 and 9999.";
  }
  const trimmedTitle = title.trim();
  const titleLength = Array.from(trimmedTitle).length;
  if (titleLength === 0) errors.title = "Title is required.";
  else if (titleLength > TITLE_MAX) errors.title = `Title must be at most ${TITLE_MAX} characters.`;
  if (Array.from(description.trim()).length > DESCRIPTION_MAX) {
    errors.description = `Description must be at most ${DESCRIPTION_MAX} characters.`;
  }
  return errors;
}

function ThemeForm({
  theme,
  initialYear,
  allowYearEdit,
  onDone,
}: {
  theme?: AnnualTheme;
  initialYear: number;
  allowYearEdit: boolean;
  onDone: () => void;
}) {
  const [year, setYear] = useState(String(theme?.year ?? initialYear));
  const [title, setTitle] = useState(theme?.title ?? "");
  const [description, setDescription] = useState(theme?.description ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const setTheme = useSetTheme();
  const errors = submitted ? validate(year, title, description, allowYearEdit) : {};

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const validationErrors = validate(year, title, description, allowYearEdit);
    if (Object.keys(validationErrors).length > 0) return;

    const input: ThemeInput = {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    setTheme.mutate(
      { year: theme?.year ?? Number(year), input },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
          else toast.error(`Couldn't save theme: ${errorMessage(error)}`);
        },
      },
    );
  };

  const update =
    <Value extends string>(setter: (value: Value) => void) =>
    (value: Value) => {
      setter(value);
      setServerError(null);
    };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      {allowYearEdit && (
        <div className="grid gap-2">
          <Label htmlFor="theme-year">Year</Label>
          <Input
            id="theme-year"
            type="number"
            min={1900}
            max={9999}
            step={1}
            value={year}
            onChange={(event) => update(setYear)(event.target.value)}
            aria-invalid={!!errors.year || undefined}
            aria-describedby={errors.year ? "theme-year-error" : undefined}
          />
          {errors.year && (
            <p id="theme-year-error" className="text-sm text-destructive">
              {errors.year}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="theme-title">Title</Label>
        <Input
          id="theme-title"
          autoFocus={!allowYearEdit}
          value={title}
          onChange={(event) => update(setTitle)(event.target.value)}
          placeholder="e.g. Year of Practice"
          aria-invalid={!!errors.title || undefined}
          aria-describedby={errors.title ? "theme-title-error" : undefined}
        />
        {errors.title && (
          <p id="theme-title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="theme-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {Array.from(description).length}/{DESCRIPTION_MAX}
          </span>
        </div>
        <Textarea
          id="theme-description"
          value={description}
          onChange={(event) => update(setDescription)(event.target.value)}
          rows={5}
          aria-invalid={!!errors.description || undefined}
          aria-describedby={errors.description ? "theme-description-error" : undefined}
        />
        {errors.description && (
          <p id="theme-description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={setTheme.isPending}>
          {setTheme.isPending ? "Saving…" : theme ? "Save theme" : "Set theme"}
        </Button>
      </DialogFooter>
    </form>
  );
}
