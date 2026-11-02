import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { chooseSavePath } from "@/lib/dialog";

import Settings from "./Settings";

vi.mock("@/lib/api", () => ({
  api: {
    getDataInfo: vi.fn(),
    exportDatabase: vi.fn(),
    exportJson: vi.fn(),
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@/lib/dialog", () => ({ chooseSavePath: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getDataInfo).mockReset().mockResolvedValue({
    dbPath: "/Users/me/lifelogging.db",
    sizeBytes: 1536,
    schemaVersion: 5,
  });
  vi.mocked(api.exportDatabase).mockReset();
  vi.mocked(api.exportJson).mockReset();
  vi.mocked(chooseSavePath).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("Settings data section", () => {
  it("shows database location, readable size, and schema version", async () => {
    renderSettings();

    expect(await screen.findByText("/Users/me/lifelogging.db")).toBeInTheDocument();
    expect(screen.getByText("1.5 KiB")).toBeInTheDocument();
    expect(screen.getByText("5", { selector: "dd" })).toBeInTheDocument();
  });

  it("does not export when the save dialog is cancelled", async () => {
    vi.mocked(chooseSavePath).mockResolvedValue(null);
    renderSettings();

    await userEvent.click(await screen.findByRole("button", { name: "Back up database…" }));

    expect(chooseSavePath).toHaveBeenCalledWith(
      expect.stringMatching(/^lifelogging-\d{4}-\d{2}-\d{2}\.db$/),
      { name: "SQLite database", extensions: ["db"] },
    );
    expect(api.exportDatabase).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a success toast after saving JSON", async () => {
    vi.mocked(chooseSavePath).mockResolvedValue("/tmp/data.json");
    vi.mocked(api.exportJson).mockResolvedValue({ path: "/tmp/data.json", bytes: 123 });
    renderSettings();

    await userEvent.click(await screen.findByRole("button", { name: "Export JSON…" }));

    expect(api.exportJson).toHaveBeenCalledWith("/tmp/data.json");
    expect(toast.success).toHaveBeenCalledWith("Saved to /tmp/data.json");
  });

  it("shows an error toast when export fails", async () => {
    vi.mocked(chooseSavePath).mockResolvedValue("/tmp/data.json");
    vi.mocked(api.exportJson).mockRejectedValue(new Error("disk full"));
    renderSettings();

    await userEvent.click(await screen.findByRole("button", { name: "Export JSON…" }));

    expect(toast.error).toHaveBeenCalledWith("Couldn't export data: Error: disk full");
  });
});
