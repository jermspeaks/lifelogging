// Placeholder — implemented in T4 (docs/PLAN.md).
import { useToday } from "@/lib/date";

export default function Today() {
  const today = useToday();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="text-sm text-muted-foreground">{today} — dashboard coming in T4.</p>
    </div>
  );
}
