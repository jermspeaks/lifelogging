import { Check, Plus, Target } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useGoals, useLogGoalProgress, useSetGoalStatus } from "@/lib/queries";
import type { GoalSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WidgetCard } from "@/widgets/WidgetCard";

import { GoalProgressInput } from "./GoalProgressInput";

function amount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function dueLabel(daysLeft: GoalSummary["daysLeft"]): { text: string; overdue: boolean } | null {
  if (daysLeft === null) return null;
  const days = Number(daysLeft);
  if (days < 0)
    return {
      text: `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`,
      overdue: true,
    };
  return { text: `${days} ${days === 1 ? "day" : "days"} left`, overdue: false };
}

export function GoalsWidget({ today }: { today: string }) {
  const { data, isPending, error } = useGoals(today);
  const log = useLogGoalProgress();
  const setStatus = useSetGoalStatus();
  const goals = data ?? [];

  const logToday = (goalId: number, value: number) =>
    log.mutate(
      { goalId, date: today, today, amount: value },
      {
        onError: (error) => toast.error(`Couldn't save goal progress: ${errorMessage(error)}`),
      },
    );

  const complete = (goalId: number, title: string) =>
    setStatus.mutate(
      { id: goalId, status: "completed", today },
      {
        onSuccess: () => toast.success(`Completed “${title}”`),
        onError: (error) => toast.error(`Couldn't complete goal: ${errorMessage(error)}`),
      },
    );

  return (
    <WidgetCard
      title="Goals"
      icon={<Target />}
      action={
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link to="/goals">Manage</Link>
        </Button>
      }
    >
      {isPending ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading goals…</p>
      ) : error ? (
        <p role="alert" className="px-2 py-6 text-center text-sm text-destructive">
          Couldn’t load goals: {errorMessage(error)}
        </p>
      ) : goals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
          <p data-today={today} className="text-sm text-muted-foreground">
            No active goals yet
          </p>
          <Button asChild size="sm">
            <Link to="/goals">
              <Plus />
              Add a goal
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {goals.map((summary) => {
            const { goal } = summary;
            const due = dueLabel(summary.daysLeft);
            const percent = summary.percent === null ? null : Number(summary.percent);
            return (
              <li key={goal.id} className="rounded-md px-2 py-2 hover:bg-accent/40">
                <div className="flex items-center gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    title={goal.description ?? undefined}
                  >
                    {goal.title}
                  </span>
                  {due && (
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        due.overdue ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {due.text}
                    </span>
                  )}
                  {goal.targetValue === null && (
                    <Button size="xs" onClick={() => complete(goal.id, goal.title)}>
                      <Check />
                      Mark complete
                    </Button>
                  )}
                </div>
                {goal.targetValue !== null && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div
                        role="progressbar"
                        aria-label={`${goal.title} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent ?? 0}
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{ width: `${percent ?? 0}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {amount(summary.current)} / {amount(goal.targetValue)}
                        {goal.unit ? ` ${goal.unit}` : ""}
                        {percent !== null && percent >= 100 && (
                          <span className="ml-2 text-primary">Target reached · Complete?</span>
                        )}
                      </p>
                    </div>
                    <GoalProgressInput
                      key={`${goal.id}-${today}-${summary.todayAmount}`}
                      goalId={goal.id}
                      title={goal.title}
                      amount={summary.todayAmount}
                      onSave={logToday}
                    />
                    {percent !== null && percent >= 100 && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => complete(goal.id, goal.title)}
                      >
                        <Check />
                        Complete
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
