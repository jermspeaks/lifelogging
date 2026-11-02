import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useDeleteQuote } from "@/lib/queries";
import type { Quote } from "@/lib/types";

export function QuoteList({ quotes, onEdit }: { quotes: Quote[]; onEdit: (quote: Quote) => void }) {
  const [filter, setFilter] = useState("");
  const [toDelete, setToDelete] = useState<Quote | null>(null);
  const remove = useDeleteQuote();
  const visibleQuotes = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return quotes;
    return quotes.filter((quote) =>
      [quote.text, quote.author, quote.source].some((value) =>
        value?.toLocaleLowerCase().includes(query),
      ),
    );
  }, [filter, quotes]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <label htmlFor="quote-filter" className="text-sm font-medium">
          Filter quotes
        </label>
        <Input
          id="quote-filter"
          type="search"
          placeholder="Search quote, author, or source…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {visibleQuotes.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {visibleQuotes.map((quote) => (
            <li key={quote.id} className="flex items-start gap-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap font-serif text-base leading-relaxed">
                  “{quote.text}”
                </p>
                {(quote.author || quote.source) && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {quote.author ? `— ${quote.author}` : "—"}
                    {quote.source && (
                      <>
                        , <em>{quote.source}</em>
                      </>
                    )}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit quote: ${quote.text}`}
                  onClick={() => onEdit(quote)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete quote: ${quote.text}`}
                  onClick={() => setToDelete(quote)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground">
          {quotes.length === 0
            ? "No quotes yet. Add a quote you love."
            : "No quotes match your filter."}
        </p>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.text}” will be permanently removed from your collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!toDelete) return;
                const quote = toDelete;
                remove.mutate(quote.id, {
                  onSuccess: () => {
                    toast.success("Quote deleted");
                    setToDelete(null);
                  },
                  onError: (error) => toast.error(`Couldn't delete quote: ${errorMessage(error)}`),
                });
              }}
            >
              Delete quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
