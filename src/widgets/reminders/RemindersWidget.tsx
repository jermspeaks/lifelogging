import { Bell } from "lucide-react";
import { Link } from "react-router";

import { WidgetCard } from "@/widgets/WidgetCard";

export function RemindersWidget({ today }: { today: string }) {
  return (
    <WidgetCard
      title="Reminders"
      icon={<Bell />}
      action={
        <Link className="text-xs text-primary hover:underline" to="/reminders">
          Manage
        </Link>
      }
    >
      <p data-today={today} className="py-2 text-sm text-muted-foreground">
        Reminders are coming soon.
      </p>
    </WidgetCard>
  );
}
