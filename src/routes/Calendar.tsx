import { CalendarDays, Trash2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useCalendars, useDeleteCalendar, useImportCalendar } from "@/lib/queries";
import type { Calendar as CalendarSource } from "@/lib/types";

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function Calendar() {
  const { data: calendars, isPending, error } = useCalendars();
  const importCalendar = useImportCalendar();
  const deleteCalendar = useDeleteCalendar();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setImportError(null);
    if (!/\.ics$/i.test(file.name)) {
      setImportError("Choose an .ics calendar file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError("Calendar file exceeds the 10 MiB import limit.");
      return;
    }
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      const result = await importCalendar.mutateAsync({ name: name.trim(), content });
      setFile(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      setImportError(null);
      toast.success(
        `Imported ${result.importedEventCount} ${result.importedEventCount === 1 ? "event" : "events"}.`,
      );
    } catch (error) {
      setImportError(errorMessage(error));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCalendar.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setImportError(`Couldn't delete calendar: ${errorMessage(error)}`);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import local .ics files to show events and birthdays on Today. Re-importing a name
          replaces its events.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border p-5" aria-labelledby="import-heading">
        <div>
          <h2 id="import-heading" className="font-medium">
            Import a calendar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Calendar data stays on this device.</p>
        </div>
        <form className="space-y-4" onSubmit={onImport}>
          <div className="grid gap-2">
            <Label htmlFor="calendar-file">.ics file</Label>
            <Input
              id="calendar-file"
              ref={fileInput}
              type="file"
              accept=".ics,text/calendar"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setFile(selected);
                if (selected) setName(selected.name.replace(/\.ics$/i, ""));
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="calendar-name">Calendar name</Label>
            <Input
              id="calendar-name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Use the selected file name"
            />
          </div>
          <Button type="submit" disabled={!file || importCalendar.isPending || !name.trim()}>
            <Upload />
            {importCalendar.isPending ? "Importing…" : "Import calendar"}
          </Button>
          {importError && (
            <p role="alert" className="text-sm text-destructive">
              {importError}
            </p>
          )}
        </form>
      </section>

      <section className="space-y-3" aria-labelledby="calendars-heading">
        <h2 id="calendars-heading" className="font-medium">
          Imported calendars
        </h2>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading calendars…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load calendars: {errorMessage(error)}
          </p>
        ) : calendars?.length ? (
          <ul className="divide-y rounded-lg border">
            {calendars.map((calendar) => (
              <li key={calendar.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{calendar.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {calendar.eventCount} {calendar.eventCount === 1 ? "event" : "events"} ·
                      Imported {dateTimeFmt.format(new Date(calendar.importedAt))}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${calendar.name}`}
                  onClick={() => setDeleteTarget(calendar)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-8 text-center">
            <p className="font-medium">No calendars imported</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose an .ics file above to add events to Today.
            </p>
          </div>
        )}
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the imported calendar and its events from this device. The source .ics
              file is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCalendar.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteCalendar.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              Delete calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
