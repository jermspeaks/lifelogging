import { CalendarDays, Clock } from "lucide-react";
import { Link } from "react-router";

import { WidgetCard } from "@/widgets/WidgetCard";
import { errorMessage } from "@/lib/api";
import { addDays, fromISODate } from "@/lib/date";
import { useUpcomingEvents } from "@/lib/queries";
import type { CalendarEvent } from "@/lib/types";

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function dateLabel(date: string, offset: number) {
  const relative =
    offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : dayFmt.format(fromISODate(date));
  return offset < 2 ? `${relative} · ${dayFmt.format(fromISODate(date))}` : relative;
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{event.summary}</p>
        <p className="text-xs text-muted-foreground">{event.calendarName}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {!event.allDay && event.startTime ? <Clock className="size-3" /> : null}
        {event.allDay
          ? "All day"
          : event.startTime
            ? event.endTime
              ? `${event.startTime}–${event.endTime}`
              : event.startTime
            : ""}
      </span>
    </li>
  );
}

export function EventsLookahead({ today }: { today: string }) {
  const { data: events, isPending, error } = useUpcomingEvents(today);
  const days = Array.from({ length: 4 }, (_, offset) => {
    const date = addDays(today, offset);
    return { date, offset, events: (events ?? []).filter((event) => event.startDate === date) };
  });

  return (
    <WidgetCard title="Events" icon={<CalendarDays className="size-4" />}>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t load events: {errorMessage(error)}
        </p>
      ) : events?.length ? (
        <div className="divide-y">
          {days.map(({ date, offset, events: dayEvents }) => (
            <section key={date} className="py-2 first:pt-0 last:pb-0">
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {dateLabel(date, offset)}
              </h3>
              {dayEvents.length ? (
                <ul className="divide-y divide-border/60">
                  {dayEvents.map((event) => (
                    <EventRow key={`${event.calendarId}:${event.uid}`} event={event} />
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-xs text-muted-foreground">No events</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="py-2 text-sm text-muted-foreground">
          <p>No events in the next four days.</p>
          <Link
            className="mt-2 inline-block text-primary underline-offset-4 hover:underline"
            to="/calendar"
          >
            Manage calendars
          </Link>
        </div>
      )}
    </WidgetCard>
  );
}
