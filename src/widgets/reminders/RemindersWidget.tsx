import { useState, type FormEvent, type ReactNode } from "react";
import { Bell, ChevronRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useCreateReminder, useDueReminders } from "@/lib/queries";
import type { Reminder } from "@/lib/types";
import { WidgetCard } from "@/widgets/WidgetCard";

import { ReminderFormDialog } from "./ReminderForm";
import { ReminderItem } from "./ReminderItem";
import { formatReminderDate } from "./reminder-groups";

export function RemindersWidget({ today }: { today: string }) {
  const { data, isPending, error } = useDueReminders(today);
  const create = useCreateReminder();
  const [quickTitle, setQuickTitle] = useState("");
  const [form, setForm] = useState<{ open: boolean; reminder: Reminder | null }>({
    open: false,
    reminder: null,
  });
  const reminders = data ?? [];
  const overdue = reminders.filter((reminder) => !reminder.completedOn && reminder.dueDate < today);
  const dueToday = reminders.filter(
    (reminder) => !reminder.completedOn && reminder.dueDate === today,
  );
  const completed = reminders.filter((reminder) => reminder.completedOn === today);

  const quickAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    create.mutate(
      { title: quickTitle.trim(), dueDate: today },
      {
        onSuccess: () => setQuickTitle(""),
        onError: (cause) => toast.error(`Couldn't add reminder: ${errorMessage(cause)}`),
      },
    );
  };

  return (
    <WidgetCard
      title="Reminders"
      icon={<Bell />}
      action={
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link to="/reminders">Manage</Link>
        </Button>
      }
    >
      {isPending ? (
        <p className="px-2 py-4 text-sm text-muted-foreground">Loading reminders…</p>
      ) : error ? (
        <p role="alert" className="px-2 py-4 text-sm text-destructive">
          Couldn't load reminders: {errorMessage(error)}
        </p>
      ) : (
        <div className="space-y-2">
          {overdue.map((reminder) => (
            <ReminderSection
              key={reminder.id}
              title={`Overdue · ${formatReminderDate(reminder.dueDate)}`}
              overdue
            >
              <ReminderItem
                reminder={reminder}
                today={today}
                onEdit={(item) => setForm({ open: true, reminder: item })}
              />
            </ReminderSection>
          ))}
          {dueToday.length > 0 && (
            <ReminderSection title="Today">
              {dueToday.map((reminder) => (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  today={today}
                  onEdit={(item) => setForm({ open: true, reminder: item })}
                />
              ))}
            </ReminderSection>
          )}
          {completed.length > 0 && (
            <Collapsible defaultOpen={completed.length <= 3}>
              <CollapsibleTrigger className="group flex w-full items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                Done today ({completed.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul>
                  {completed.map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={reminder}
                      today={today}
                      onEdit={(item) => setForm({ open: true, reminder: item })}
                    />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          )}
          {reminders.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nothing due today</p>
          )}
          <form onSubmit={quickAdd} className="flex gap-2 border-t px-2 pt-3">
            <Input
              aria-label="Add a reminder for today"
              placeholder="Add a reminder for today…"
              value={quickTitle}
              onChange={(event) => setQuickTitle(event.target.value)}
              maxLength={210}
            />
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label="Add reminder"
              disabled={!quickTitle.trim() || create.isPending}
            >
              <Plus />
            </Button>
          </form>
        </div>
      )}
      <ReminderFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        today={today}
        reminder={form.reminder}
      />
    </WidgetCard>
  );
}

function ReminderSection({
  title,
  overdue = false,
  children,
}: {
  title: string;
  overdue?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h3
        className={`px-2 pb-1 text-xs font-semibold ${overdue ? "text-destructive" : "text-muted-foreground"}`}
      >
        {title}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}
