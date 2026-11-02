import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnualTheme } from "@/lib/types";

import Themes from "./Themes";

const queries = vi.hoisted(() => ({
  useThemes: vi.fn(),
  useDeleteTheme: vi.fn(),
  useSetTheme: vi.fn(),
}));
vi.mock("@/lib/queries", () => queries);

const themes: AnnualTheme[] = [
  {
    year: 2027,
    title: "Year of Focus",
    description: "Make space",
    createdAt: "2027-01-01T00:00:00Z",
    updatedAt: "2027-01-01T00:00:00Z",
  },
];
const mutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  queries.useThemes.mockReturnValue({ data: themes, isPending: false, error: null });
  queries.useDeleteTheme.mockReturnValue({ mutate, isPending: false });
  queries.useSetTheme.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("Themes route", () => {
  it("lists theme details and confirms before deleting", async () => {
    const user = userEvent.setup();
    render(<Themes />);
    expect(screen.getByText("2027 · Year of Focus")).toBeInTheDocument();
    expect(screen.getByText("Make space")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete 2027 theme" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete theme" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(2027, expect.any(Object)));
  });

  it("uses next year as the add default when it is not already used", () => {
    render(<Themes />);
    fireEvent.click(screen.getByRole("button", { name: "Add theme" }));
    const year = Number(screen.getByLabelText("Year").getAttribute("value"));
    const currentYear = new Date().getFullYear();
    expect(year).toBe(
      themes.some((theme) => theme.year === currentYear + 1) ? currentYear : currentYear + 1,
    );
  });
});
