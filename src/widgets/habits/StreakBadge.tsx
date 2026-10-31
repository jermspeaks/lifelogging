import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/** Current streak as "🔥 n" (flame icon + count); dimmed when there is no streak. */
export function StreakBadge({ streak, className }: { streak: number; className?: string }) {
  const label = `Current streak: ${streak} ${streak === 1 ? "day" : "days"}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex min-w-9 items-center justify-end gap-0.5 text-xs font-medium tabular-nums",
        streak > 0 ? "text-orange-500" : "text-muted-foreground/60",
        className,
      )}
    >
      <Flame className="size-3.5" aria-hidden />
      {streak}
    </span>
  );
}
