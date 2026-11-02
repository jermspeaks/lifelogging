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
import { useCreateQuote, useUpdateQuote } from "@/lib/queries";
import type { NewQuote, Quote } from "@/lib/types";

type Values = { text: string; author: string; source: string };
type Errors = Partial<Record<keyof Values, string>>;

function validate(values: Values): Errors {
  const errors: Errors = {};
  const textLength = Array.from(values.text.trim()).length;
  if (textLength === 0) errors.text = "Quote text is required";
  else if (textLength > 1_000) errors.text = "Quote text must be at most 1,000 characters";
  if (Array.from(values.author.trim()).length > 200)
    errors.author = "Author must be at most 200 characters";
  if (Array.from(values.source.trim()).length > 200)
    errors.source = "Source must be at most 200 characters";
  return errors;
}

export function QuoteFormDialog({
  open,
  onOpenChange,
  quote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{quote ? "Edit quote" : "Add quote"}</DialogTitle>
          <DialogDescription>
            {quote ? "Update the quote or its attribution." : "Save a quote for your collection."}
          </DialogDescription>
        </DialogHeader>
        <QuoteForm
          key={quote?.id ?? "new"}
          quote={quote ?? undefined}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function QuoteForm({ quote, onDone }: { quote?: Quote; onDone: () => void }) {
  const [values, setValues] = useState<Values>(() => ({
    text: quote?.text ?? "",
    author: quote?.author ?? "",
    source: quote?.source ?? "",
  }));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateQuote();
  const update = useUpdateQuote();
  const pending = create.isPending || update.isPending;
  const errors = submitted ? validate(values) : {};

  const set = (key: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerError(null);
  };

  const onError = (error: unknown) => {
    if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
    else toast.error(`Couldn't save quote: ${errorMessage(error)}`);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(values)).length > 0) return;
    const input: NewQuote = {
      text: values.text.trim(),
      ...(values.author.trim() ? { author: values.author.trim() } : {}),
      ...(values.source.trim() ? { source: values.source.trim() } : {}),
    };
    if (quote) {
      update.mutate(
        {
          id: quote.id,
          patch: { text: input.text, author: values.author.trim(), source: values.source.trim() },
        },
        { onSuccess: onDone, onError },
      );
    } else {
      create.mutate(input, { onSuccess: onDone, onError });
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="quote-text">Quote</Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Array.from(values.text.trim()).length}/1,000
          </span>
        </div>
        <Textarea
          id="quote-text"
          autoFocus
          rows={4}
          value={values.text}
          onChange={(event) => set("text", event.target.value)}
          aria-invalid={!!errors.text || undefined}
          aria-describedby={errors.text ? "quote-text-error" : undefined}
        />
        {errors.text && (
          <p id="quote-text-error" className="text-sm text-destructive">
            {errors.text}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="quote-author">
          Author <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="quote-author"
          value={values.author}
          onChange={(event) => set("author", event.target.value)}
          aria-invalid={!!errors.author || undefined}
          aria-describedby={errors.author ? "quote-author-error" : undefined}
        />
        {errors.author && (
          <p id="quote-author-error" className="text-sm text-destructive">
            {errors.author}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="quote-source">
          Source <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="quote-source"
          value={values.source}
          onChange={(event) => set("source", event.target.value)}
          aria-invalid={!!errors.source || undefined}
          aria-describedby={errors.source ? "quote-source-error" : undefined}
        />
        {errors.source && (
          <p id="quote-source-error" className="text-sm text-destructive">
            {errors.source}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : quote ? "Save" : "Add quote"}
        </Button>
      </DialogFooter>
    </form>
  );
}
