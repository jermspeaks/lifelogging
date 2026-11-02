import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnualTheme } from "@/lib/types";

import { ThemeBanner } from "./ThemeBanner";

const query = vi.hoisted(() => ({
  useTheme: vi.fn(),
  useSetTheme: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/queries", () => query);

const theme: AnnualTheme = {
  year: 2024,
  title: "Year of Practice",
  description: "One step each day.\nKeep going.",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("ThemeBanner", () => {
  it("shows the selected year, first description line, progress, and edit action", () => {
    query.useTheme.mockReturnValue({ data: theme, isPending: false, error: null });
    render(<ThemeBanner today="2024-02-29" />);

    expect(screen.getByText("2024 · Year of Practice")).toBeInTheDocument();
    expect(screen.getByText("One step each day.")).toBeInTheDocument();
    expect(screen.queryByText("Keep going.")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Day 60 of 366" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit 2024 theme" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Year of Practice");
  });

  it("offers a set action for an empty current year", () => {
    query.useTheme.mockReturnValue({ data: null, isPending: false, error: null });
    render(<ThemeBanner today="2026-01-01" />);

    expect(screen.getByRole("button", { name: "Set a theme for 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set a theme for 2026" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
