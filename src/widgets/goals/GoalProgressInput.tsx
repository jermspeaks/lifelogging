import { useRef, useState } from "react";

export function GoalProgressInput({
  goalId,
  title,
  amount,
  onSave,
}: {
  goalId: number;
  title: string;
  amount: number;
  onSave: (goalId: number, amount: number) => void;
}) {
  const [value, setValue] = useState(String(amount));
  const lastSaved = useRef(amount);

  const save = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === lastSaved.current) return;
    lastSaved.current = parsed;
    onSave(goalId, parsed);
  };

  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      Today
      <input
        aria-label={`Today progress for ${title}`}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm text-foreground tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </label>
  );
}
