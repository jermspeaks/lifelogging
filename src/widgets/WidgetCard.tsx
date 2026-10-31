import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type WidgetCardProps = {
  /** Widget title shown in the header. */
  title: ReactNode;
  /** Optional icon rendered before the title. */
  icon?: ReactNode;
  /** Optional header action (link, button, menu…) aligned to the right. */
  action?: ReactNode;
  /** Extra classes for the outer frame, e.g. grid spans on the dashboard. */
  className?: string;
  children: ReactNode;
};

/** The generic frame every dashboard widget renders inside (habits, calendar, journal…). */
export function WidgetCard({ title, icon, action, className, children }: WidgetCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          {title}
        </h2>
        {action}
      </header>
      <div className="flex-1 p-2">{children}</div>
    </section>
  );
}
