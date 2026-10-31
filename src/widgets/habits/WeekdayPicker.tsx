import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Bit 0 = Monday … bit 6 = Sunday (SPEC §5). */
const DAYS = [
  { short: "M", long: "Monday" },
  { short: "T", long: "Tuesday" },
  { short: "W", long: "Wednesday" },
  { short: "T", long: "Thursday" },
  { short: "F", long: "Friday" },
  { short: "S", long: "Saturday" },
  { short: "S", long: "Sunday" },
] as const;

export const EVERY_DAY_MASK = 127;
export const WEEKDAYS_MASK = 31;

type Props = {
  value: number;
  onChange: (mask: number) => void;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
};

export function WeekdayPicker({ value, onChange, id, invalid, describedBy }: Props) {
  const selected = DAYS.map((_, i) => String(i)).filter((i) => (value & (1 << Number(i))) !== 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        id={id}
        type="multiple"
        variant="outline"
        size="sm"
        value={selected}
        onValueChange={(days) => onChange(days.reduce((mask, d) => mask | (1 << Number(d)), 0))}
        aria-label="Scheduled days"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        {DAYS.map((day, i) => (
          <ToggleGroupItem
            key={day.long}
            value={String(i)}
            aria-label={day.long}
            title={day.long}
            className="w-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {day.short}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex gap-1">
        <Button
          type="button"
          variant={value === EVERY_DAY_MASK ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(EVERY_DAY_MASK)}
        >
          Every day
        </Button>
        <Button
          type="button"
          variant={value === WEEKDAYS_MASK ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onChange(WEEKDAYS_MASK)}
        >
          Weekdays
        </Button>
      </div>
    </div>
  );
}
