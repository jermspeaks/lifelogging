import { Pencil, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useTheme } from "@/lib/queries";

import { ThemeDialog } from "./ThemeDialog";
import { yearProgress } from "./year-progress";

export function ThemeBanner({ today }: { today: string }) {
  const year = Number(today.slice(0, 4));
  const { data: theme, isPending, error } = useTheme(year);
  const [dialogOpen, setDialogOpen] = useState(false);
  const progress = yearProgress(today);

  if (isPending) return null;
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load theme: {errorMessage(error)}
      </p>
    );
  }

  if (!theme) {
    return (
      <>
        <Button
          variant="outline"
          className="w-full justify-start rounded-xl py-3 text-muted-foreground"
          onClick={() => setDialogOpen(true)}
        >
          <Sparkles />
          Set a theme for {year}
        </Button>
        <ThemeDialog open={dialogOpen} onOpenChange={setDialogOpen} initialYear={year} />
      </>
    );
  }

  const descriptionLine = theme.description?.split(/\r?\n/, 1)[0]?.trim();
  return (
    <>
      <section className="rounded-xl border bg-card px-4 py-3" aria-label={`${year} annual theme`}>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">
              {year} · {theme.title}
            </h2>
            {descriptionLine && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{descriptionLine}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${year} theme`}
            title="Edit theme"
            onClick={() => setDialogOpen(true)}
          >
            <Pencil />
          </Button>
        </div>
        {progress && (
          <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
            <div
              role="progressbar"
              aria-label={`Day ${progress.day} of ${progress.daysInYear}`}
              aria-valuemin={1}
              aria-valuemax={progress.daysInYear}
              aria-valuenow={progress.day}
              className="h-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${(progress.day / progress.daysInYear) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              Day {progress.day} of {progress.daysInYear}
            </span>
          </div>
        )}
      </section>
      <ThemeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        theme={theme}
        initialYear={year}
      />
    </>
  );
}
