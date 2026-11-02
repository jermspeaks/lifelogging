import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";
import { useJournalEntry, useSaveJournalEntry } from "@/lib/queries";

const MAX_BODY_LENGTH = 100_000;
const savedTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

type JournalEditorProps = {
  date: string;
  today: string;
  rows?: number;
  placeholder?: string;
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

/** A single-date journal editor with debounced saves and a serial save queue. */
export function JournalEditor({
  date,
  today,
  rows = 12,
  placeholder = "Write about your day…",
}: JournalEditorProps) {
  const entry = useJournalEntry(date, today);
  const { mutateAsync } = useSaveJournalEntry();
  const [body, setBody] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const bodyRef = useRef(body);
  const savedBodyRef = useRef("");
  const loadedDateRef = useRef<string | null>(null);
  const identityRef = useRef({ date, today });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persist = useCallback(
    (targetDate: string, targetToday: string, value: string): Promise<void> => {
      if (value === savedBodyRef.current && targetDate === identityRef.current.date)
        return Promise.resolve();
      if (targetDate === identityRef.current.date) setStatus({ kind: "saving" });
      const request = queueRef.current
        .catch(() => undefined)
        .then(() => mutateAsync({ date: targetDate, today: targetToday, body: value }));
      queueRef.current = request;
      return request.then(
        () => {
          if (targetDate !== identityRef.current.date) return;
          savedBodyRef.current = value;
          if (bodyRef.current === value) setStatus({ kind: "saved", at: new Date().toISOString() });
        },
        (error: unknown) => {
          if (targetDate === identityRef.current.date && bodyRef.current === value) {
            setStatus({ kind: "error", message: errorMessage(error) });
          }
        },
      );
    },
    [mutateAsync],
  );

  const flush = useCallback(
    (targetDate = date, targetToday = today, value = bodyRef.current) => {
      clearTimer();
      if (targetDate === identityRef.current.date && (!hydrated || value === savedBodyRef.current))
        return Promise.resolve();
      return persist(targetDate, targetToday, value);
    },
    [clearTimer, date, hydrated, persist, today],
  );

  useEffect(() => {
    const previous = identityRef.current;
    if (previous.date !== date || previous.today !== today) {
      clearTimer();
      if (loadedDateRef.current === previous.date && bodyRef.current !== savedBodyRef.current) {
        void persist(previous.date, previous.today, bodyRef.current);
      }
      identityRef.current = { date, today };
      loadedDateRef.current = null;
      bodyRef.current = "";
      setBody("");
      setHydrated(false);
      setStatus({ kind: "idle" });
    }
  }, [clearTimer, date, persist, today]);

  useEffect(() => {
    if (!entry.isSuccess || loadedDateRef.current === date) return;
    loadedDateRef.current = date;
    const loadedBody = entry.data?.body ?? "";
    bodyRef.current = loadedBody;
    savedBodyRef.current = loadedBody;
    setBody(loadedBody);
    setHydrated(true);
  }, [date, entry.data, entry.isSuccess]);

  useEffect(() => {
    clearTimer();
    if (!hydrated || body === savedBodyRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persist(date, today, body);
    }, 1_000);
    return clearTimer;
  }, [body, clearTimer, date, hydrated, persist, today]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  function changeBody(value: string) {
    bodyRef.current = value;
    setBody(value);
    if (status.kind === "error") setStatus({ kind: "idle" });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(event) => changeBody(event.currentTarget.value)}
        onBlur={() => void flush()}
        rows={rows}
        maxLength={MAX_BODY_LENGTH}
        placeholder={placeholder}
        disabled={!hydrated || entry.isError}
        aria-label={`Journal entry for ${date}`}
        aria-busy={!hydrated || status.kind === "saving"}
      />
      {entry.isPending && <p className="text-xs text-muted-foreground">Loading entry…</p>}
      {entry.isError && (
        <p role="alert" className="text-xs text-destructive">
          Couldn't load entry: {errorMessage(entry.error)}
        </p>
      )}
      {status.kind === "saving" && (
        <p role="status" className="text-xs text-muted-foreground">
          Saving…
        </p>
      )}
      {status.kind === "saved" && (
        <p role="status" className="text-xs text-muted-foreground">
          Saved {savedTimeFormat.format(new Date(status.at))}
        </p>
      )}
      {status.kind === "error" && (
        <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
          <span>Couldn't save: {status.message}</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => void flush()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
