import type { HabitColor } from "@/lib/types";

export const HABIT_COLORS: HabitColor[] = [
  "slate",
  "red",
  "amber",
  "green",
  "blue",
  "violet",
  "pink",
];

/** Tailwind classes per palette key. Full class names so Tailwind can see them. */
export const habitColorClasses: Record<HabitColor, { dot: string; ring: string; label: string }> = {
  slate: { dot: "bg-slate-500", ring: "ring-slate-500", label: "Slate" },
  red: { dot: "bg-red-500", ring: "ring-red-500", label: "Red" },
  amber: { dot: "bg-amber-500", ring: "ring-amber-500", label: "Amber" },
  green: { dot: "bg-green-500", ring: "ring-green-500", label: "Green" },
  blue: { dot: "bg-blue-500", ring: "ring-blue-500", label: "Blue" },
  violet: { dot: "bg-violet-500", ring: "ring-violet-500", label: "Violet" },
  pink: { dot: "bg-pink-500", ring: "ring-pink-500", label: "Pink" },
};
