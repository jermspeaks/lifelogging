import { fromISODate } from "@/lib/date";
import type { DayEntry, DayStatus, HabitColor } from "@/lib/types";
import { cn } from "@/lib/utils";

import { habitColorClasses } from "./colors";

const STATUS_LABEL: Record<DayStatus, string> = {
  done: "done",
  missed: "missed",
  skipped: "not scheduled",
  pending: "pending",
};

/** Classes per status. `done` and `pending` use the habit's color. */
function statusClass(status: DayStatus, color: HabitColor): string {
  const c = habitColorClasses[color];
  switch (status) {
    case "done":
      return c.dot;
    case "pending":
      return cn("bg-transparent ring-2 ring-inset", c.ring);
    case "missed":
      return "bg-muted-foreground/35";
    case "skipped":
      return "bg-transparent ring-1 ring-inset ring-muted-foreground/30";
  }
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** The last 7 days (oldest → today) as a row of status dots, each with a date/status tooltip. */
export function WeekStrip({
  days,
  color,
  className,
}: {
  days: DayEntry[];
  color: HabitColor;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-1", className)} aria-label="Last 7 days">
      {days.map(({ date, status }) => {
        const label = `${dateFmt.format(fromISODate(date))}: ${STATUS_LABEL[status]}`;
        return (
          <li
            key={date}
            title={label}
            aria-label={label}
            data-status={status}
            className={cn("size-2.5 rounded-full", statusClass(status, color))}
          />
        );
      })}
    </ol>
  );
}
