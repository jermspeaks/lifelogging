import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronRight, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { errorMessage } from "@/lib/api";
import { queryKeys, useDeleteGoal, useReorderGoals, useSetGoalStatus } from "@/lib/queries";
import type { Goal, GoalSummary, GoalStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

function displayAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
}

function GoalDescription({ summary }: { summary: GoalSummary }) {
  const { goal } = summary;
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{goal.title}</div>
      <div className="truncate text-sm text-muted-foreground">
        {goal.targetValue !== null
          ? `${displayAmount(summary.current)} / ${displayAmount(goal.targetValue)}${goal.unit ? ` ${goal.unit}` : ""}`
          : "Milestone goal"}
        {goal.description && ` · ${goal.description}`}
      </div>
    </div>
  );
}

export function ActiveGoalsList({
  goals,
  onEdit,
  today,
}: {
  goals: GoalSummary[];
  onEdit: (goal: Goal) => void;
  today: string;
}) {
  const qc = useQueryClient();
  const reorder = useReorderGoals();
  const setStatus = useSetGoalStatus();

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= goals.length) return;
    const next = [...goals];
    [next[index], next[target]] = [next[target], next[index]];
    const order = new Map(next.map((row, position) => [row.goal.id, position]));
    for (const includeClosed of [false, true]) {
      qc.setQueryData<GoalSummary[]>(queryKeys.goalList(today, includeClosed), (rows) =>
        rows
          ? [...rows].sort(
              (a, b) =>
                (order.get(a.goal.id) ?? Number.MAX_SAFE_INTEGER) -
                (order.get(b.goal.id) ?? Number.MAX_SAFE_INTEGER),
            )
          : rows,
      );
    }
    reorder.mutate(
      next.map((row) => row.goal.id),
      {
        onError: (error) => toast.error(`Couldn't reorder goals: ${errorMessage(error)}`),
      },
    );
  };

  const close = (goal: Goal, status: GoalStatus) =>
    setStatus.mutate(
      { id: goal.id, status, today },
      {
        onSuccess: () =>
          toast.success(
            status === "completed" ? `Completed “${goal.title}”` : `Abandoned “${goal.title}”`,
          ),
        onError: (error) => toast.error(`Couldn't update goal: ${errorMessage(error)}`),
      },
    );

  if (goals.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {goals.map((summary, index) => (
        <li key={summary.goal.id} className="flex items-center gap-3 px-4 py-3">
          <GoalDescription summary={summary} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${summary.goal.title} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${summary.goal.title} down`}
              disabled={index === goals.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${summary.goal.title}`}
              onClick={() => onEdit(summary.goal)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Complete ${summary.goal.title}`}
              onClick={() => close(summary.goal, "completed")}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Abandon ${summary.goal.title}`}
              onClick={() => close(summary.goal, "abandoned")}
            >
              <RotateCcw />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ClosedGoals({ goals, today }: { goals: GoalSummary[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Goal | null>(null);
  const setStatus = useSetGoalStatus();
  const remove = useDeleteGoal();

  if (goals.length === 0) return null;
  return (
    <section className="space-y-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
            Closed ({goals.length})
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="divide-y rounded-lg border">
            {goals.map((summary) => (
              <li key={summary.goal.id} className="flex items-center gap-3 px-4 py-3 opacity-80">
                <GoalDescription summary={summary} />
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {summary.goal.status}
                  {summary.goal.closedOn ? ` · ${summary.goal.closedOn}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Reopen ${summary.goal.title}`}
                  onClick={() =>
                    setStatus.mutate(
                      { id: summary.goal.id, status: "active", today },
                      {
                        onError: (error) =>
                          toast.error(`Couldn't reopen goal: ${errorMessage(error)}`),
                      },
                    )
                  }
                >
                  <RotateCcw />
                  Reopen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${summary.goal.title}`}
                  onClick={() => setToDelete(summary.goal)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
      <AlertDialog open={!!toDelete} onOpenChange={(value) => !value && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete <em>{toDelete?.title}</em> and its progress?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the goal and every logged progress entry. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!toDelete) return;
                const { id, title } = toDelete;
                remove.mutate(id, {
                  onSuccess: () => toast.success(`Deleted “${title}”`),
                  onError: (error) => toast.error(`Couldn't delete goal: ${errorMessage(error)}`),
                });
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
