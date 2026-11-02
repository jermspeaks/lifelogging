import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronRight, Pencil, Trash2 } from "lucide-react";

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
import { openExternal } from "@/lib/open";
import { fromISODate } from "@/lib/date";
import { useDeleteNote, useSetNoteArchived } from "@/lib/queries";
import type { Note } from "@/lib/types";
import { cn } from "@/lib/utils";

function nextReviewLabel(note: Note, today: string): string {
  if (!note.nextReviewDate || note.nextReviewDate <= today) return "Due today";
  const days = Math.round(
    (fromISODate(note.nextReviewDate).getTime() - fromISODate(today).getTime()) / 86_400_000,
  );
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

function NoteRow({
  note,
  today,
  archived,
  onEdit,
}: {
  note: Note;
  today: string;
  archived: boolean;
  onEdit: (note: Note) => void;
}) {
  const archive = useSetNoteArchived();
  const remove = useDeleteNote();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setArchived = (next: boolean) =>
    archive.mutate(
      { id: note.id, archived: next, today },
      {
        onSuccess: () => {
          if (next) {
            toast.success(`Archived “${note.title}”`, {
              action: {
                label: "Undo",
                onClick: () =>
                  archive.mutate(
                    { id: note.id, archived: false, today },
                    {
                      onError: (error) =>
                        toast.error(`Couldn't unarchive note: ${errorMessage(error)}`),
                    },
                  ),
              },
            });
          }
        },
        onError: (error) =>
          toast.error(`Couldn't ${next ? "archive" : "unarchive"} note: ${errorMessage(error)}`),
      },
    );

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{note.title}</div>
        {note.body && (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
            {note.body}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{archived ? "Archived" : nextReviewLabel(note, today)}</span>
          {note.url && (
            <button
              className="text-primary hover:underline"
              aria-label={`Open link for ${note.title}`}
              onClick={() =>
                void openExternal(note.url!).catch((error) =>
                  toast.error(`Couldn't open link: ${errorMessage(error)}`),
                )
              }
            >
              Link
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {archived ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Unarchive ${note.title}`}
            title="Unarchive"
            onClick={() => setArchived(false)}
          >
            <ArchiveRestore />
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${note.title}`}
              title="Edit"
              onClick={() => onEdit(note)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Archive ${note.title}`}
              title="Archive"
              onClick={() => setArchived(true)}
            >
              <Archive />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${note.title}`}
          title="Delete"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 />
        </Button>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{note.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the note and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove.mutate(note.id, {
                  onSuccess: () => setConfirmDelete(false),
                  onError: (error) => toast.error(`Couldn't delete note: ${errorMessage(error)}`),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function NoteList({
  notes,
  archived = false,
  today,
  onEdit,
}: {
  notes: Note[];
  archived?: boolean;
  today: string;
  onEdit: (note: Note) => void;
}) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;
  const rows = (
    <ul className="divide-y rounded-lg border">
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} today={today} archived={archived} onEdit={onEdit} />
      ))}
    </ul>
  );
  if (!archived) return rows;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
          Archived ({notes.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{rows}</CollapsibleContent>
    </Collapsible>
  );
}
