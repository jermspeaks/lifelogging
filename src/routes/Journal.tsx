import { useState } from "react";
import { Link, useSearchParams } from "react-router";

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
import { useToday } from "@/lib/date";
import { useDeleteJournalEntry, useJournalEntries } from "@/lib/queries";
import type { JournalSummary } from "@/lib/types";
import { JournalEditor } from "@/widgets/journal/JournalEditor";

const PAGE_SIZE = 50;
const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

type JournalListPageProps = {
  query?: string;
  before?: string;
  index: number;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onLoadMore: (date: string) => void;
};

function JournalListPage({
  query,
  before,
  index,
  selectedDate,
  onSelectDate,
  onLoadMore,
}: JournalListPageProps) {
  const page = useJournalEntries(query, before, PAGE_SIZE);
  if (page.isPending) {
    return <li className="px-3 py-4 text-sm text-muted-foreground">Loading entries…</li>;
  }
  if (page.isError) {
    return (
      <li role="alert" className="px-3 py-4 text-sm text-destructive">
        Couldn't load entries: {errorMessage(page.error)}
      </li>
    );
  }
  if (page.data.length === 0) {
    return index === 0 ? (
      <li className="px-4 py-6 text-center text-sm text-muted-foreground">
        {query ? "No entries match your search." : "No journal entries yet."}
      </li>
    ) : null;
  }
  return (
    <>
      {page.data.map((entry: JournalSummary) => (
        <li key={entry.date}>
          <button
            type="button"
            onClick={() => onSelectDate(entry.date)}
            aria-current={entry.date === selectedDate ? "date" : undefined}
            className="w-full space-y-1 px-3 py-3 text-left hover:bg-accent/50 aria-[current=date]:bg-accent"
          >
            <span className="block text-sm font-medium">
              {dateLabel.format(new Date(`${entry.date}T12:00:00`))}
            </span>
            <span className="block line-clamp-2 text-sm text-muted-foreground">
              {entry.preview}
            </span>
            <span className="block text-xs text-muted-foreground">
              {entry.wordCount} {entry.wordCount === 1 ? "word" : "words"}
            </span>
          </button>
        </li>
      ))}
      {page.data.length === PAGE_SIZE && (
        <li className="p-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={page.isFetching}
            onClick={() => onLoadMore(page.data[page.data.length - 1].date)}
          >
            {page.isFetching ? "Loading…" : "Load more"}
          </Button>
        </li>
      )}
    </>
  );
}

export default function Journal() {
  const today = useToday();
  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get("date");
  const selectedDate = isValidDate(dateParam) && dateParam <= today ? dateParam : today;
  const [query, setQuery] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const remove = useDeleteJournalEntry();

  function selectDate(date: string) {
    setSearchParams({ date });
  }

  function updateQuery(value: string) {
    setQuery(value);
    setCursors([undefined]);
  }

  async function deleteEntry() {
    try {
      await remove.mutateAsync(selectedDate);
      setDeleteOpen(false);
      setEditorVersion((version) => version + 1);
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A private, plain-text record of your days.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.5fr)]">
        <section className="space-y-3" aria-labelledby="journal-entries-heading">
          <h2 id="journal-entries-heading" className="font-medium">
            Entries
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="journal-search">Search entries</Label>
            <Input
              id="journal-search"
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.currentTarget.value)}
              placeholder="Search your journal"
            />
          </div>

          <ul className="divide-y rounded-lg border">
            {cursors.map((before, index) => (
              <JournalListPage
                key={`${query}:${index}`}
                query={query.trim() ? query : undefined}
                before={before}
                index={index}
                selectedDate={selectedDate}
                onSelectDate={selectDate}
                onLoadMore={(date) => setCursors((current) => [...current, date])}
              />
            ))}
          </ul>
        </section>

        <section className="space-y-4" aria-labelledby="journal-editor-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-2">
              <Label htmlFor="journal-date">Entry date</Label>
              <Input
                id="journal-date"
                type="date"
                max={today}
                value={selectedDate}
                onChange={(event) => {
                  if (event.currentTarget.value) selectDate(event.currentTarget.value);
                }}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => setDeleteOpen(true)}
            >
              Delete entry
            </Button>
          </div>
          <h2 id="journal-editor-heading" className="sr-only">
            Edit entry for {selectedDate}
          </h2>
          <JournalEditor
            key={`${selectedDate}:${editorVersion}`}
            date={selectedDate}
            today={today}
          />
        </section>
      </div>

      <p className="text-sm text-muted-foreground">
        Looking for today?{" "}
        <Link className="text-primary underline-offset-4 hover:underline" to="/">
          Back to Today
        </Link>
      </p>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the entry for {selectedDate}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes this journal entry. This action can't be undone.
            </AlertDialogDescription>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                void deleteEntry();
              }}
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
