import { fromISODate, useToday } from "@/lib/date";
import { useTodayHabits } from "@/lib/queries";
import { CalendarWidget } from "@/widgets/calendar/CalendarWidget";
import { HabitChecklist } from "@/widgets/habits/HabitChecklist";

const headerFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** The `/` dashboard: date header + summary, then a responsive grid of widgets. */
export default function Today() {
  const today = useToday();
  const { data } = useTodayHabits(today);

  let summary: string | null = null;
  if (data && data.length > 0) {
    const scheduled = data.filter((r) => r.scheduledToday);
    const done = scheduled.filter((r) => r.doneToday).length;
    summary =
      scheduled.length === 0
        ? "No habits scheduled today"
        : `${done} of ${scheduled.length} ${scheduled.length === 1 ? "habit" : "habits"} done`;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {headerFmt.format(fromISODate(today))}
        </h1>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HabitChecklist today={today} className="lg:col-span-2" />
        <CalendarWidget today={today} />
      </div>
    </div>
  );
}
