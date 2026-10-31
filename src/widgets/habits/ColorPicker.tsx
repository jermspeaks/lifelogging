import { Check } from "lucide-react";
import { useRef } from "react";

import type { HabitColor } from "@/lib/types";
import { cn } from "@/lib/utils";

import { HABIT_COLORS, habitColorClasses } from "./colors";

type Props = {
  value: HabitColor;
  onChange: (color: HabitColor) => void;
  id?: string;
};

/** Palette swatches as a radio group (arrow keys move between swatches). */
export function ColorPicker({ value, onChange, id }: Props) {
  const refs = useRef(new Map<HabitColor, HTMLButtonElement>());

  const move = (delta: number) => {
    const i = HABIT_COLORS.indexOf(value);
    const next = HABIT_COLORS[(i + delta + HABIT_COLORS.length) % HABIT_COLORS.length];
    onChange(next);
    refs.current.get(next)?.focus();
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Color"
      className="flex flex-wrap gap-2 py-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {HABIT_COLORS.map((color) => {
        const c = habitColorClasses[color];
        const checked = color === value;
        return (
          <button
            key={color}
            ref={(el) => {
              if (el) refs.current.set(color, el);
              else refs.current.delete(color);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={c.label}
            title={c.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-white outline-none",
              "ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2",
              c.dot,
              checked ? cn("ring-2", c.ring) : "focus-visible:ring-ring",
            )}
          >
            {checked && <Check className="size-4" />}
          </button>
        );
      })}
    </div>
  );
}
