import { Sparkles } from "lucide-react";

export function ThemeBanner({ today }: { today: string }) {
  return (
    <section className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
      <Sparkles className="size-4" />
      Set an annual theme for {today.slice(0, 4)} to keep it in view here.
    </section>
  );
}
