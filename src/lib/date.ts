import { useEffect, useState } from "react";

/** Format a Date as a local calendar date, `YYYY-MM-DD`. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as a local Date at midnight. */
export function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Today's local date, `YYYY-MM-DD`. The frontend is the authority on "today" (SPEC §5). */
export function todayLocal(): string {
  return toISODate(new Date());
}

/** Today's local date; re-evaluated when the window regains focus (app left open overnight). */
export function useToday(): string {
  const [today, setToday] = useState(todayLocal);

  useEffect(() => {
    const refresh = () => setToday(todayLocal());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return today;
}
