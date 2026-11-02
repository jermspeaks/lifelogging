import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useGoals } from "@/lib/queries";
import { useToday } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { ClosedGoals, ActiveGoalsList } from "@/widgets/goals/GoalsList";
import { GoalFormDialog } from "@/widgets/goals/GoalFormDialog";

export default function Goals() {
  const today = useToday();
  const { data, isPending, error } = useGoals(today, true);
  const [form, setForm] = useState<{ open: boolean; goal: Goal | null }>({
    open: false,
    goal: null,
  });
  const goals = data ?? [];
  const active = goals.filter((summary) => summary.goal.status === "active");
  const closed = goals.filter((summary) => summary.goal.status !== "active");
  const openNew = () => setForm({ open: true, goal: null });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Keep meaningful milestones and longer-term progress in view.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus />
          New goal
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading goals…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load goals: {errorMessage(error)}
        </p>
      ) : (
        <>
          {active.length > 0 ? (
            <ActiveGoalsList
              goals={active}
              today={today}
              onEdit={(goal) => setForm({ open: true, goal })}
            />
          ) : (
            <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="font-medium">No active goals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a milestone or start tracking toward a number.
              </p>
              <Button className="mt-4" variant="outline" onClick={openNew}>
                <Plus />
                New goal
              </Button>
            </div>
          )}
          <ClosedGoals goals={closed} today={today} />
        </>
      )}

      <GoalFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        goal={form.goal}
      />
    </div>
  );
}
