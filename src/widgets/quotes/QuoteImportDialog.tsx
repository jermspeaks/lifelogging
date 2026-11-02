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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, isApiError } from "@/lib/api";
import { useImportQuotes } from "@/lib/queries";
import type { ImportQuotesResult } from "@/lib/types";

export function QuoteImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportQuotesResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useImportQuotes();

  const changeOpen = (next: boolean) => {
    if (!next) {
      setText("");
      setResult(null);
      setServerError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setResult(null);
    mutation.mutate(text, {
      onSuccess: (counts) => {
        setResult(counts);
        toast.success(`Imported ${counts.imported}, skipped ${counts.skipped} duplicates`);
      },
      onError: (error) => {
        if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
        else toast.error(`Couldn't import quotes: ${errorMessage(error)}`);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste many quotes</DialogTitle>
          <DialogDescription>
            Put one quote on each line. Add an author after “ — ”, “ -- ”, or “ ~ ”.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="quotes-import">Quotes</Label>
            <Textarea
              id="quotes-import"
              autoFocus
              rows={9}
              placeholder={"“The secret of getting ahead is getting started.” — Mark Twain"}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-describedby="quotes-import-hint"
            />
            <p id="quotes-import-hint" className="text-xs text-muted-foreground">
              Up to 1,000 lines. Duplicate text and author pairs are skipped.
            </p>
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          {result && (
            <p role="status" className="rounded-md border px-3 py-2 text-sm">
              Imported {result.imported}, skipped {result.skipped} duplicates.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={mutation.isPending || text.trim().length === 0}>
              {mutation.isPending ? "Importing…" : "Import quotes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
