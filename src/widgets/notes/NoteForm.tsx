import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, isApiError } from "@/lib/api";
import { useCreateNote, useUpdateNote } from "@/lib/queries";
import type { Note } from "@/lib/types";

const TITLE_MAX = 200;
const BODY_MAX = 5_000;
const URL_MAX = 2_000;

type NoteFormProps = {
  note?: Note;
  today: string;
  onDone: () => void;
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//u.test(value);
}

export function NoteForm({ note, today, onDone }: NoteFormProps) {
  const [titleOrUrl, setTitleOrUrl] = useState(note?.title ?? "");
  const [url, setUrl] = useState(note?.url ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [showBody, setShowBody] = useState(Boolean(note?.body));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateNote();
  const update = useUpdateNote();
  const pending = create.isPending || update.isPending;

  const trimmed = titleOrUrl.trim();
  const pastedUrl = !note && isHttpUrl(trimmed) ? trimmed : "";
  const title = (pastedUrl || trimmed).trim();
  const finalUrl = note ? url.trim() : pastedUrl;
  const errors = {
    title:
      title.length === 0
        ? "Title is required."
        : Array.from(title).length > TITLE_MAX
          ? `Title must be at most ${TITLE_MAX} characters.`
          : "",
    body:
      Array.from(body.trim()).length > BODY_MAX
        ? `Body must be at most ${BODY_MAX} characters.`
        : "",
    url:
      finalUrl.length > URL_MAX
        ? `URL must be at most ${URL_MAX} characters.`
        : finalUrl &&
            (!isHttpUrl(finalUrl) ||
              /\s/u.test(finalUrl) ||
              !finalUrl.slice(finalUrl.indexOf("://") + 3).split(/[/?#]/u, 1)[0])
          ? "Use an absolute http or https URL with a host."
          : "",
  };

  const setServerValidation = (error: unknown) => {
    if (isApiError(error) && error.kind === "Validation") setServerError(error.message);
    else toast.error(`Couldn't save note: ${errorMessage(error)}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setServerError(null);
    if (note) {
      update.mutate(
        { id: note.id, patch: { title, body: body.trim(), url: url.trim() } },
        { onSuccess: onDone, onError: setServerValidation },
      );
    } else {
      create.mutate(
        {
          input: {
            title,
            ...(pastedUrl ? { url: pastedUrl } : {}),
            ...(body.trim() ? { body: body.trim() } : {}),
          },
          today,
        },
        {
          onSuccess: () => {
            setTitleOrUrl("");
            setBody("");
            setShowBody(false);
            setSubmitted(false);
            onDone();
          },
          onError: setServerValidation,
        },
      );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-3">
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor={note ? "edit-note-title" : "new-note-title"}>
          {note ? "Title" : "Title or link"}
        </Label>
        <Input
          id={note ? "edit-note-title" : "new-note-title"}
          value={titleOrUrl}
          onChange={(event) => {
            setTitleOrUrl(event.target.value);
            setServerError(null);
          }}
          placeholder={note ? "Note title" : "A thought or pasted URL"}
          aria-invalid={(submitted && Boolean(errors.title)) || undefined}
          aria-describedby={submitted && errors.title ? "note-title-error" : undefined}
          autoFocus={Boolean(note)}
        />
        {submitted && errors.title && (
          <p id="note-title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        )}
      </div>
      {note && (
        <div className="grid gap-2">
          <Label htmlFor="edit-note-url">
            Link <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="edit-note-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
          />
          {submitted && errors.url && <p className="text-sm text-destructive">{errors.url}</p>}
        </div>
      )}
      {showBody ? (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={note ? "edit-note-body" : "new-note-body"}>
              Body <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <span className="text-xs text-muted-foreground">
              {Array.from(body).length}/{BODY_MAX}
            </span>
          </div>
          <Textarea
            id={note ? "edit-note-body" : "new-note-body"}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={note ? 5 : 3}
            aria-invalid={(submitted && Boolean(errors.body)) || undefined}
          />
          {submitted && errors.body && <p className="text-sm text-destructive">{errors.body}</p>}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit px-0"
          onClick={() => setShowBody(true)}
        >
          Add a body
        </Button>
      )}
      <div className="flex justify-end gap-2">
        {note && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : note ? "Save note" : "Save note"}
        </Button>
      </div>
    </form>
  );
}
