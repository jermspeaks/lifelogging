import { Plus, TextQuote } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useQuotes } from "@/lib/queries";
import type { Quote } from "@/lib/types";
import { QuoteFormDialog } from "@/widgets/quotes/QuoteForm";
import { QuoteImportDialog } from "@/widgets/quotes/QuoteImportDialog";
import { QuoteList } from "@/widgets/quotes/QuoteList";

type FormDialog = { open: boolean; quote: Quote | null };

export default function Quotes() {
  const { data: quotes, isPending, error } = useQuotes();
  const [form, setForm] = useState<FormDialog>({ open: false, quote: null });
  const [importOpen, setImportOpen] = useState(false);
  const openNew = () => setForm({ open: true, quote: null });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">
            Keep the words you want to carry with you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <TextQuote />
            Paste many
          </Button>
          <Button onClick={openNew}>
            <Plus />
            Add quote
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading quotes…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load quotes: {errorMessage(error)}
        </p>
      ) : (
        <QuoteList quotes={quotes ?? []} onEdit={(quote) => setForm({ open: true, quote })} />
      )}

      <QuoteFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        quote={form.quote}
      />
      <QuoteImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
