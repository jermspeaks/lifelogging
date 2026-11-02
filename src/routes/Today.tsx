import { fromISODate, useToday } from "@/lib/date";
import { useTodayHabits } from "@/lib/queries";
import { EventsLookahead } from "@/widgets/calendar/EventsLookahead";
import { JournalWidget } from "@/widgets/journal/JournalWidget";
import { QuoteWidget } from "@/widgets/quotes/QuoteWidget";
import { ThemeBanner } from "@/widgets/themes/ThemeBanner";
import { HabitChecklist } from "@/widgets/habits/HabitChecklist";
import { GoalsWidget } from "@/widgets/goals/GoalsWidget";
import { ReviewWidget } from "@/widgets/notes/ReviewWidget";
import { RemindersWidget } from "@/widgets/reminders/RemindersWidget";

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
      <ThemeBanner today={today} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RemindersWidget today={today} />
        <HabitChecklist today={today} />
        <EventsLookahead today={today} />
        <JournalWidget today={today} />
        <GoalsWidget today={today} />
        <ReviewWidget today={today} />
        <QuoteWidget today={today} />
      </div>
    </div>
  );
}
