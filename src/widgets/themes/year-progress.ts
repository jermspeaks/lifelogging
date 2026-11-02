const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type YearProgress = { day: number; daysInYear: number };

/** Returns one-based day-of-year progress for a strict local YYYY-MM-DD date. */
export function yearProgress(today: string): YearProgress | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const start = new Date(0);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCFullYear(year, 0, 1);
  const next = new Date(0);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCFullYear(year + 1, 0, 1);

  return {
    day: Math.floor((date.getTime() - start.getTime()) / MS_PER_DAY) + 1,
    daysInYear: Math.round((next.getTime() - start.getTime()) / MS_PER_DAY),
  };
}
