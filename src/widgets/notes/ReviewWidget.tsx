import { BookMarked } from "lucide-react";
import { Link } from "react-router";

import { WidgetCard } from "@/widgets/WidgetCard";

export function ReviewWidget({ today }: { today: string }) {
  return (
    <WidgetCard
      title="Review"
      icon={<BookMarked />}
      action={
        <Link className="text-xs text-primary hover:underline" to="/notes">
          Manage
        </Link>
      }
    >
      <p data-today={today} className="py-2 text-sm text-muted-foreground">
        Notes review is coming soon.
      </p>
    </WidgetCard>
  );
}
