import { Quote as QuoteIcon } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/widgets/WidgetCard";
import { errorMessage } from "@/lib/api";
import { useDailyQuote } from "@/lib/queries";

export function QuoteWidget({ today }: { today: string }) {
  const { data: quote, isPending, error } = useDailyQuote(today);

  return (
    <WidgetCard title="Quote" icon={<QuoteIcon />}>
      {isPending ? (
        <p data-date={today} className="px-2 py-3 text-sm text-muted-foreground">
          Loading quote…
        </p>
      ) : error ? (
        <p role="alert" className="px-2 py-3 text-sm text-destructive">
          Couldn't load quote: {errorMessage(error)}
        </p>
      ) : quote ? (
        <figure data-date={today} className="px-3 py-4">
          <blockquote className="font-serif text-lg leading-relaxed">“{quote.text}”</blockquote>
          {(quote.author || quote.source) && (
            <figcaption className="mt-3 text-sm text-muted-foreground">
              {quote.author ? `— ${quote.author}` : "—"}
              {quote.source && (
                <>
                  , <em>{quote.source}</em>
                </>
              )}
            </figcaption>
          )}
        </figure>
      ) : (
        <div data-date={today} className="flex flex-col items-start gap-2 px-2 py-3">
          <p className="text-sm text-muted-foreground">Add quotes you love</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/quotes">Add a quote</Link>
          </Button>
        </div>
      )}
    </WidgetCard>
  );
}
