import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

import { api } from "@/lib/api";
import type { Calendar, ImportCalendarResult } from "@/lib/types";

import CalendarPage from "./Calendar";

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:birthday",
  "DTSTART;VALUE=DATE:19901103",
  "RRULE:FREQ=YEARLY",
  "SUMMARY:Mom's birthday",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

vi.mock("@/lib/api", () => ({
  api: {
    listCalendars: vi.fn(),
    importCalendar: vi.fn(),
    deleteCalendar: vi.fn(),
  },
  errorMessage: (error: unknown) => String(error),
}));

function renderCalendar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const source: Calendar = {
  id: 1,
  name: "Family",
  importedAt: "2026-10-31T12:00:00Z",
  eventCount: 1,
};

beforeEach(() => {
  vi.mocked(api.listCalendars).mockReset().mockResolvedValue([]);
  vi.mocked(api.importCalendar).mockReset();
  vi.mocked(api.deleteCalendar).mockReset().mockResolvedValue(undefined);
});

describe("Calendar management", () => {
  it("imports the selected .ics file using its filename as the default name", async () => {
    let calendars: Calendar[] = [];
    vi.mocked(api.listCalendars).mockImplementation(async () => calendars);
    vi.mocked(api.importCalendar).mockImplementation(async (name, content) => {
      expect(name).toBe("Family");
      expect(content).toBe(ICS);
      calendars = [source];
      return { calendar: source, importedEventCount: 1 } satisfies ImportCalendarResult;
    });
    renderCalendar();

    const file = new File([ICS], "Family.ics", { type: "text/calendar" });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode(ICS).buffer as ArrayBuffer,
    });
    await userEvent.upload(screen.getByLabelText(".ics file"), file);
    expect(screen.getByLabelText("Calendar name")).toHaveValue("Family");
    await userEvent.click(screen.getByRole("button", { name: "Import calendar" }));

    expect(await screen.findByText("Family", { selector: "p" })).toBeInTheDocument();
    expect(api.importCalendar).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation before deleting an imported calendar", async () => {
    let calendars = [source];
    vi.mocked(api.listCalendars).mockImplementation(async () => calendars);
    vi.mocked(api.deleteCalendar).mockImplementation(async (id) => {
      expect(id).toBe(source.id);
      calendars = [];
    });
    renderCalendar();

    const row = await screen.findByText("Family", { selector: "p" });
    await userEvent.click(
      within(row.closest("li")!).getByRole("button", { name: "Delete Family" }),
    );
    expect(screen.getByText(/source .ics file is not affected/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete calendar" }));

    await waitFor(() => expect(api.deleteCalendar).toHaveBeenCalledWith(source.id));
    expect(await screen.findByText("No calendars imported")).toBeInTheDocument();
  });
});
