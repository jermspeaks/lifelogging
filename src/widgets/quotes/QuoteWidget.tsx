import { Quote as QuoteIcon } from "lucide-react";

import { WidgetCard } from "@/widgets/WidgetCard";

export function QuoteWidget({ today }: { today: string }) {
  return (
    <WidgetCard title="Quote" icon={<QuoteIcon />}>
      <p data-date={today} className="px-2 py-3 text-sm text-muted-foreground">
        Add a quote you love to see it here.
      </p>
    </WidgetCard>
  );
}
