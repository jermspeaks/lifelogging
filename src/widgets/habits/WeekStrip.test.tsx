import { render, screen } from "@testing-library/react";

import type { DayEntry } from "@/lib/types";

import { WeekStrip } from "./WeekStrip";

const days: DayEntry[] = [
  { date: "2026-10-24", status: "skipped" },
  { date: "2026-10-25", status: "done" },
  { date: "2026-10-26", status: "missed" },
  { date: "2026-10-27", status: "done" },
  { date: "2026-10-28", status: "skipped" },
  { date: "2026-10-29", status: "missed" },
  { date: "2026-10-30", status: "pending" },
];

describe("WeekStrip", () => {
  it("renders 7 dots with the right status classes and tooltips", () => {
    render(<WeekStrip days={days} color="blue" />);
    const dots = screen.getAllByRole("listitem");
    expect(dots).toHaveLength(7);

    dots.forEach((dot, i) => expect(dot).toHaveAttribute("data-status", days[i].status));

    // done → filled with the habit color
    expect(dots[1]).toHaveClass("bg-blue-500");
    // pending → ring in the habit color, not filled
    expect(dots[6]).toHaveClass("ring-blue-500", "bg-transparent");
    expect(dots[6]).not.toHaveClass("bg-blue-500");
    // missed → muted fill
    expect(dots[2]).toHaveClass("bg-muted-foreground/35");
    expect(dots[2]).not.toHaveClass("bg-blue-500");
    // skipped → hollow outline
    expect(dots[0]).toHaveClass("ring-muted-foreground/30", "bg-transparent");

    expect(dots[6].getAttribute("title")).toMatch(/pending$/);
    expect(dots[0].getAttribute("title")).toMatch(/not scheduled$/);
  });
});
