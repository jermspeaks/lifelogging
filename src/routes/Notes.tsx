import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { useToday } from "@/lib/date";
import { useNotes } from "@/lib/queries";
import type { Note } from "@/lib/types";
import { NoteForm } from "@/widgets/notes/NoteForm";
import { NoteList } from "@/widgets/notes/NoteList";

export default function Notes() {
  const today = useToday();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const { data: notes, isPending, error } = useNotes(query || undefined, true);
  const active = useMemo(() => (notes ?? []).filter((note) => !note.archivedAt), [notes]);
  const archived = useMemo(() => (notes ?? []).filter((note) => Boolean(note.archivedAt)), [notes]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="text-sm text-muted-foreground">
          Save ideas and links to revisit on a spaced schedule.
        </p>
      </div>

      <section aria-label="Add a note" className="rounded-lg border p-4">
        <NoteForm today={today} onDone={() => {}} />
      </section>

      <div className="grid gap-2">
        <Label htmlFor="notes-search">Search notes</Label>
        <Input
          id="notes-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, body, or link"
        />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load notes: {errorMessage(error)}
        </p>
      ) : (
        <>
          {active.length > 0 ? (
            <NoteList notes={active} today={today} onEdit={setEditing} />
          ) : (
            <div className="rounded-lg border border-dashed px-6 py-8 text-center">
              <p className="font-medium">No notes found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Save a thought or link above to start your review queue.
              </p>
            </div>
          )}
          <NoteList notes={archived} archived today={today} onEdit={setEditing} />
        </>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
            <DialogDescription>
              Editing the note does not change its review schedule.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <NoteForm
              key={editing.id}
              note={editing}
              today={today}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
