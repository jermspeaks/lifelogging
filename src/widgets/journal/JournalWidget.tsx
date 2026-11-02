import { BookOpen } from "lucide-react";

import { WidgetCard } from "@/widgets/WidgetCard";

export function JournalWidget({ today }: { today: string }) {
  return (
    <WidgetCard title="Journal" icon={<BookOpen />} className="lg:col-span-2">
      <p data-date={today} className="px-2 py-3 text-sm text-muted-foreground">
        Journal entries are coming soon.
      </p>
    </WidgetCard>
  );
}
