import { BookOpen } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/widgets/WidgetCard";

import { JournalEditor } from "./JournalEditor";

export function JournalWidget({ today }: { today: string }) {
  return (
    <WidgetCard
      title="Journal"
      icon={<BookOpen />}
      className="lg:col-span-2"
      action={
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link to="/journal">All entries</Link>
        </Button>
      }
    >
      <JournalEditor date={today} today={today} rows={6} placeholder="How was today?" />
    </WidgetCard>
  );
}
