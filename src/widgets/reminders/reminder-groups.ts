import { addDays, fromISODate } from "@/lib/date";
import type { Reminder } from "@/lib/types";

export type ReminderGroup = {
  key: string;
  label: string;
  reminders: Reminder[];
  overdue?: boolean;
};

export function groupUpcomingReminders(reminders: Reminder[], today: string): ReminderGroup[] {
  const incomplete = reminders.filter((reminder) => reminder.completedOn === null);
  const overdue = incomplete.filter((reminder) => reminder.dueDate < today);
  const todayItems = incomplete.filter((reminder) => reminder.dueDate === today);
  const tomorrow = addDays(today, 1);
  const tomorrowItems = incomplete.filter((reminder) => reminder.dueDate === tomorrow);
  const later = new Map<string, Reminder[]>();
  for (const reminder of incomplete) {
    if (reminder.dueDate <= tomorrow) continue;
    const group = later.get(reminder.dueDate) ?? [];
    group.push(reminder);
    later.set(reminder.dueDate, group);
  }
  const groups: ReminderGroup[] = [];
  if (overdue.length)
    groups.push({ key: "overdue", label: "Overdue", reminders: overdue, overdue: true });
  if (todayItems.length) groups.push({ key: today, label: "Today", reminders: todayItems });
  if (tomorrowItems.length)
    groups.push({ key: tomorrow, label: "Tomorrow", reminders: tomorrowItems });
  for (const [date, items] of [...later.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({
      key: date,
      label: fromISODate(date).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      reminders: items,
    });
  }
  return groups;
}

export function formatReminderDate(value: string): string {
  return fromISODate(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
