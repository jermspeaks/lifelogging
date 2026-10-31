import { ChevronRight, ListChecks, Plus } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { errorMessage } from "@/lib/api";
import { useSetHabitCheck, useTodayHabits } from "@/lib/queries";
import type { TodayHabit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WidgetCard } from "@/widgets/WidgetCard";

import { habitColorClasses } from "./colors";
import { StreakBadge } from "./StreakBadge";
import { WeekStrip } from "./WeekStrip";

type HabitChecklistProps = {
  /** The dashboard's current local date (`YYYY-MM-DD`), from `useToday()`. */
  today: string;
  className?: string;
};

/** Today's habits: scheduled ones first, then a collapsed "Not scheduled today" group. */
export function HabitChecklist({ today, className }: HabitChecklistProps) {
  const { data, isPending, isError, error } = useTodayHabits(today);
  const setCheck = useSetHabitCheck();

  const toggle = (row: TodayHabit, done: boolean) =>
    setCheck.mutate({ habitId: row.habit.id, date: today, today, done });

  const scheduled = data?.filter((r) => r.scheduledToday) ?? [];
  const unscheduled = data?.filter((r) => !r.scheduledToday) ?? [];

  let body;
  if (isPending) {
    body = <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading habits…</p>;
  } else if (isError) {
    body = (
      <p className="px-2 py-6 text-center text-sm text-destructive">
        Couldn't load habits: {errorMessage(error)}
      </p>
    );
  } else if (data.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">No habits yet</p>
        <Button asChild size="sm">
          <Link to="/habits">
            <Plus />
            Add a habit
          </Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-1">
        {scheduled.length > 0 ? (
          <ul>
            {scheduled.map((row) => (
              <HabitRow key={row.habit.id} row={row} onToggle={toggle} />
            ))}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing scheduled today.</p>
        )}
        {unscheduled.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
              Not scheduled today ({unscheduled.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul>
                {unscheduled.map((row) => (
                  <HabitRow key={row.habit.id} row={row} onToggle={toggle} />
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  }

  return (
    <WidgetCard
      title="Habits"
      icon={<ListChecks />}
      className={className}
      action={
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link to="/habits">Manage</Link>
        </Button>
      }
    >
      {body}
    </WidgetCard>
  );
}

function HabitRow({
  row,
  onToggle,
}: {
  row: TodayHabit;
  onToggle: (row: TodayHabit, done: boolean) => void;
}) {
  const { habit, doneToday, currentStreak, last7 } = row;
  const id = `habit-check-${habit.id}`;
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
      <Checkbox
        id={id}
        checked={doneToday}
        onCheckedChange={(checked) => onToggle(row, checked === true)}
      />
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", habitColorClasses[habit.color].dot)}
      />
      <label
        htmlFor={id}
        className={cn(
          "min-w-0 flex-1 cursor-pointer truncate text-sm",
          doneToday && "text-muted-foreground line-through decoration-muted-foreground/50",
        )}
        title={habit.description ?? undefined}
      >
        {habit.name}
      </label>
      <StreakBadge streak={currentStreak} />
      <WeekStrip days={last7} color={habit.color} className="shrink-0" />
    </li>
  );
}
