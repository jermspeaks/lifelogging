import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarSource, EventOccurrence } from "@/lib/types";

import { CalendarWidget } from "./CalendarWidget";

const TODAY = "2026-10-30";
const api = vi.hoisted(() => ({
  getUpcomingEvents: vi.fn(),
  listCalendarSources: vi.fn(),
  importCalendar: vi.fn(),
  deleteCalendar: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api };
});

const sources: CalendarSource[] = [
  { id: 7, name: "Personal.ics", importedAt: "2026-10-30T00:00:00Z", eventCount: 2 },
];
const events: EventOccurrence[] = [
  {
    id: 11,
    sourceId: 7,
    sourceName: "Personal.ics",
    uid: "birthday",
    summary: "Sam's birthday",
    description: null,
    location: null,
    date: TODAY,
    allDay: true,
    startTime: null,
    endTime: null,
  },
  {
    id: 12,
    sourceId: 7,
    sourceName: "Personal.ics",
    uid: "coffee",
    summary: "Coffee with Lee",
    description: null,
    location: "Cafe",
    date: "2026-11-01",
    allDay: false,
    startTime: "09:30",
    endTime: "10:00",
  },
];

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getUpcomingEvents.mockResolvedValue(events);
  api.listCalendarSources.mockResolvedValue(sources);
  api.importCalendar.mockResolvedValue({ ...sources[0], eventCount: 1 });
  api.deleteCalendar.mockResolvedValue(undefined);
});

describe("CalendarWidget", () => {
  it("groups the four dates and shows all-day and timed event details", async () => {
    wrap(<CalendarWidget today={TODAY} />);

    expect(await screen.findByText("Sam's birthday")).toBeInTheDocument();
    expect(screen.getByText("All day")).toBeInTheDocument();
    expect(screen.getByText("Coffee with Lee")).toBeInTheDocument();
    expect(screen.getByText("Cafe")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today" })).toContainElement(
      screen.getByText("Sam's birthday"),
    );
    expect(screen.getByRole("region", { name: "Sunday, November 1" })).toContainElement(
      screen.getByText("Coffee with Lee"),
    );
    expect(screen.getByRole("region", { name: "Tomorrow" })).toHaveTextContent("No events");
    expect(api.getUpcomingEvents).toHaveBeenCalledWith(TODAY);
  });

  it("imports a selected file as a new source and replaces a source by id", async () => {
    const user = userEvent.setup();
    wrap(<CalendarWidget today={TODAY} />);
    const input = await screen.findByLabelText("Calendar file");
    const ics = new File(["BEGIN:VCALENDAR\nEND:VCALENDAR"], "new.ics", { type: "text/calendar" });

    await user.click(screen.getByRole("button", { name: /Import/ }));
    await user.upload(input, ics);
    await waitFor(() =>
      expect(api.importCalendar).toHaveBeenCalledWith("new.ics", expect.any(String), undefined),
    );

    await user.click(screen.getByRole("button", { name: "Replace Personal.ics" }));
    const replacement = new File(["BEGIN:VCALENDAR\nEND:VCALENDAR"], "updated.ics", {
      type: "text/calendar",
    });
    await user.upload(input, replacement);
    await waitFor(() =>
      expect(api.importCalendar).toHaveBeenLastCalledWith("updated.ics", expect.any(String), 7),
    );
  });

  it("requires confirmation before removing a source", async () => {
    const user = userEvent.setup();
    wrap(<CalendarWidget today={TODAY} />);

    await user.click(await screen.findByRole("button", { name: "Remove Personal.ics" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/Remove Personal.ics and all of its imported events/),
    ).toBeInTheDocument();
    expect(api.deleteCalendar).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deleteCalendar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove Personal.ics" }));
    await user.click(await screen.findByRole("button", { name: "Remove calendar" }));
    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledWith(7));
  });

  it("renders file import errors inline", async () => {
    const user = userEvent.setup();
    api.importCalendar.mockRejectedValue({ kind: "Validation", message: "Invalid calendar" });
    wrap(<CalendarWidget today={TODAY} />);
    const input = await screen.findByLabelText("Calendar file");
    await user.upload(input, new File(["bad"], "bad.ics", { type: "text/calendar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't import calendar: Invalid calendar",
    );
  });
});
