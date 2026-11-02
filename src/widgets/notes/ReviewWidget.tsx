import { useState } from "react";
import { BookMarked } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { openExternal } from "@/lib/open";
import { useReviewNote, useReviewQueue, useSetNoteArchived } from "@/lib/queries";
import { WidgetCard } from "@/widgets/WidgetCard";

function savedDate(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function ReviewWidget({ today }: { today: string }) {
  const { data: queue, isPending, error } = useReviewQueue(today, 5);
  const review = useReviewNote();
  const archive = useSetNoteArchived();
  const [busyId, setBusyId] = useState<number | null>(null);
  const note = queue?.due[0];
  const busy = busyId !== null;

  const act = (action: "keep" | "snooze") => {
    if (!note) return;
    setBusyId(note.id);
    review.mutate(
      { id: note.id, today, action },
      {
        onError: (e) =>
          toast.error(`Couldn't ${action === "keep" ? "keep" : "snooze"} note: ${errorMessage(e)}`),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const done = () => {
    if (!note) return;
    setBusyId(note.id);
    archive.mutate(
      { id: note.id, archived: true, today },
      {
        onSuccess: () =>
          toast.success(`Finished “${note.title}”`, {
            action: {
              label: "Undo",
              onClick: () =>
                archive.mutate(
                  { id: note.id, archived: false, today },
                  { onError: (e) => toast.error(`Couldn't restore note: ${errorMessage(e)}`) },
                ),
            },
          }),
        onError: (e) => toast.error(`Couldn't finish note: ${errorMessage(e)}`),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <WidgetCard
      title="Review"
      icon={<BookMarked />}
      action={
        <Link className="text-xs text-primary hover:underline" to="/notes">
          Manage
        </Link>
      }
    >
      {isPending ? (
        <p data-today={today} className="py-2 text-sm text-muted-foreground">
          Loading notes…
        </p>
      ) : error ? (
        <p role="alert" className="py-2 text-sm text-destructive">
          Couldn't load notes: {errorMessage(error)}
        </p>
      ) : note ? (
        <div className="space-y-3 px-2 py-3" data-today={today}>
          <div>
            {note.url ? (
              <button
                className="text-left font-medium text-primary hover:underline"
                onClick={() =>
                  void openExternal(note.url!).catch((e) =>
                    toast.error(`Couldn't open link: ${errorMessage(e)}`),
                  )
                }
              >
                {note.title}
              </button>
            ) : (
              <h3 className="font-medium">{note.title}</h3>
            )}
            {note.body && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6] overflow-hidden">
                {note.body}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Saved {savedDate(note.createdAt)} · reviewed {note.reviewStage}×
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => act("keep")} disabled={busy}>
              Keep
            </Button>
            <Button variant="outline" size="sm" onClick={() => act("snooze")} disabled={busy}>
              Snooze
            </Button>
            <Button variant="ghost" size="sm" onClick={done} disabled={busy}>
              Done
            </Button>
            {queue.dueCount > 1 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {queue.dueCount - 1} more due
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 px-2 py-3">
          <p className="text-sm text-muted-foreground">Nothing to review today</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/notes">Save a note</Link>
          </Button>
        </div>
      )}
    </WidgetCard>
  );
}
