import { Target } from "lucide-react";
import { Link } from "react-router";

import { WidgetCard } from "@/widgets/WidgetCard";

export function GoalsWidget({ today }: { today: string }) {
  return (
    <WidgetCard
      title="Goals"
      icon={<Target />}
      action={
        <Link className="text-xs text-primary hover:underline" to="/goals">
          Manage
        </Link>
      }
    >
      <p data-today={today} className="py-2 text-sm text-muted-foreground">
        Goals are coming soon.
      </p>
    </WidgetCard>
  );
}
