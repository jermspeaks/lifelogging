import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { CalendarDays, Clock3, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { errorMessage } from "@/lib/api";
import { addDays, fromISODate } from "@/lib/date";
import {
  useCalendarSources,
  useDeleteCalendar,
  useImportCalendar,
  useUpcomingEvents,
} from "@/lib/queries";
import type { CalendarSource, EventOccurrence } from "@/lib/types";
import { WidgetCard } from "@/widgets/WidgetCard";

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayTitle(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return dayFormat.format(fromISODate(date));
}

type CalendarWidgetProps = { today: string };

/** Four-day local agenda with file-backed calendar sources. */
export function CalendarWidget({ today }: CalendarWidgetProps) {
  const {
    data: events,
    isPending: eventsPending,
    isError: eventsError,
    error: eventsErrorValue,
  } = useUpcomingEvents(today);
  const {
    data: sources,
    isPending: sourcesPending,
    isError: sourcesError,
    error: sourcesErrorValue,
  } = useCalendarSources();
  const importCalendar = useImportCalendar();
  const deleteCalendar = useDeleteCalendar();
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceSourceId = useRef<number | undefined>(undefined);
  const [sourceToDelete, setSourceToDelete] = useState<CalendarSource | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const chooseFile = (sourceId?: number) => {
    replaceSourceId.current = sourceId;
    setActionError(null);
    fileInput.current?.click();
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const source = await importCalendar.mutateAsync({
        name: file.name,
        content: await file.text(),
        sourceId: replaceSourceId.current,
      });
      toast.success(`Imported ${source.name} (${source.eventCount} events)`);
      setActionError(null);
    } catch (error) {
      setActionError(`Couldn't import calendar: ${errorMessage(error)}`);
    } finally {
      input.value = "";
      replaceSourceId.current = undefined;
    }
  };

  const removeSource = async () => {
    if (!sourceToDelete) return;
    try {
      await deleteCalendar.mutateAsync(sourceToDelete.id);
      toast.success(`Removed ${sourceToDelete.name}`);
      setActionError(null);
      setSourceToDelete(null);
    } catch (error) {
      setActionError(`Couldn't remove calendar: ${errorMessage(error)}`);
    }
  };

  let agenda;
  if (eventsPending) {
    agenda = <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading events…</p>;
  } else if (eventsError) {
    agenda = (
      <p className="px-2 py-6 text-center text-sm text-destructive">
        Couldn't load events: {errorMessage(eventsErrorValue)}
      </p>
    );
  } else {
    agenda = (
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, index) => {
          const date = addDays(today, index);
          const daysEvents = events.filter((item) => item.date === date);
          return (
            <section key={date} aria-label={dayTitle(date, today)}>
              <h3 className="mb-1 border-b px-2 pb-1 text-xs font-semibold text-muted-foreground">
                {dayTitle(date, today)}
                {date !== today && ` · ${dayFormat.format(fromISODate(date))}`}
              </h3>
              {daysEvents.length ? (
                <ul>
                  {daysEvents.map((item) => (
                    <EventRow key={`${item.id}-${item.date}`} event={item} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">No events</p>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <WidgetCard
      title="Calendar"
      icon={<CalendarDays />}
      action={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={() => chooseFile()}
          disabled={importCalendar.isPending}
        >
          <Plus /> Import
        </Button>
      }
    >
      <input
        ref={fileInput}
        aria-label="Calendar file"
        className="sr-only"
        type="file"
        accept=".ics,text/calendar"
        onChange={onFileChange}
      />
      {actionError && (
        <p role="alert" className="mb-2 px-2 text-sm text-destructive">
          {actionError}
        </p>
      )}
      {agenda}
      <div className="mt-4 border-t pt-3">
        <h3 className="px-2 text-xs font-semibold text-muted-foreground">Calendars</h3>
        {sourcesPending ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">Loading calendars…</p>
        ) : sourcesError ? (
          <p className="px-2 py-2 text-xs text-destructive">
            Couldn't load calendars: {errorMessage(sourcesErrorValue)}
          </p>
        ) : sources.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Import an .ics file to see events here.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate" title={source.name}>
                  {source.name}{" "}
                  <span className="text-xs text-muted-foreground">({source.eventCount})</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Replace ${source.name}`}
                  title={`Replace ${source.name}`}
                  disabled={importCalendar.isPending}
                  onClick={() => chooseFile(source.id)}
                >
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${source.name}`}
                  title={`Remove ${source.name}`}
                  onClick={() => setSourceToDelete(source)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <AlertDialog
        open={sourceToDelete !== null}
        onOpenChange={(open) => !open && setSourceToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {sourceToDelete?.name} and all of its imported events?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteCalendar.isPending}
              onClick={(event) => {
                event.preventDefault();
                void removeSource();
              }}
            >
              Remove calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WidgetCard>
  );
}

function EventRow({ event }: { event: EventOccurrence }) {
  const time = event.allDay
    ? "All day"
    : event.startTime
      ? timeFormat.format(new Date(`2000-01-01T${event.startTime}:00`))
      : "";
  const endTime = event.endTime
    ? timeFormat.format(new Date(`2000-01-01T${event.endTime}:00`))
    : null;
  return (
    <li className="rounded-md px-2 py-2 hover:bg-accent/50">
      <div className="flex items-start gap-3">
        <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
          {time}
          {endTime && ` – ${endTime}`}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={event.summary}>
            {event.summary}
          </p>
          <p className="text-xs text-muted-foreground">{event.sourceName}</p>
          {event.location && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" /> {event.location}
            </p>
          )}
          {event.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{event.description}</p>
          )}
        </div>
        {!event.allDay && <Clock3 aria-hidden className="mt-0.5 size-3.5 text-muted-foreground" />}
      </div>
    </li>
  );
}
