import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorMessage } from "@/lib/api";
import { useReminders } from "@/lib/queries";
import { useToday } from "@/lib/date";
import type { Reminder } from "@/lib/types";
import { ReminderFormDialog } from "@/widgets/reminders/ReminderForm";
import { ReminderItem } from "@/widgets/reminders/ReminderItem";
import { groupUpcomingReminders } from "@/widgets/reminders/reminder-groups";

export default function Reminders() {
  const today = useToday();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [form, setForm] = useState<{ open: boolean; reminder: Reminder | null }>({
    open: false,
    reminder: null,
  });
  const { data, isPending, error } = useReminders(today, includeCompleted);
  const reminders = data ?? [];
  const upcomingGroups = groupUpcomingReminders(reminders, today);
  const completed = reminders.filter((reminder) => reminder.completedOn !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reminders</h1>
          <p className="text-sm text-muted-foreground">Small things, on the day you need them.</p>
        </div>
        <Button onClick={() => setForm({ open: true, reminder: null })}>
          <Plus />
          New reminder
        </Button>
      </div>

      <label className="flex w-fit items-center gap-2 text-sm">
        <Checkbox
          checked={includeCompleted}
          onCheckedChange={(checked) => setIncludeCompleted(checked === true)}
        />
        Show completed (last 30 days)
      </label>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading reminders…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load reminders: {errorMessage(error)}
        </p>
      ) : upcomingGroups.length === 0 && completed.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No reminders yet. Add one to keep it on your radar.
        </p>
      ) : (
        <div className="space-y-6">
          {upcomingGroups.map((group) => (
            <section key={group.key} aria-label={group.label} className="space-y-2">
              <h2
                className={`text-sm font-semibold ${group.overdue ? "text-destructive" : "text-muted-foreground"}`}
              >
                {group.label}
              </h2>
              <ul className="divide-y rounded-lg border">
                {group.reminders.map((reminder) => (
                  <ReminderItem
                    key={reminder.id}
                    reminder={reminder}
                    today={today}
                    onEdit={(item) => setForm({ open: true, reminder: item })}
                  />
                ))}
              </ul>
            </section>
          ))}
          {completed.length > 0 && (
            <section aria-label="Completed reminders" className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Completed</h2>
              <ul className="divide-y rounded-lg border">
                {completed.map((reminder) => (
                  <ReminderItem
                    key={reminder.id}
                    reminder={reminder}
                    today={today}
                    onEdit={(item) => setForm({ open: true, reminder: item })}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <ReminderFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        today={today}
        reminder={form.reminder}
      />
    </div>
  );
}
