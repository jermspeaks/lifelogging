import { describe, expect, it } from "vitest";

import { yearProgress } from "./year-progress";

describe("yearProgress", () => {
  it("counts leap days", () => {
    expect(yearProgress("2024-02-29")).toEqual({ day: 60, daysInYear: 366 });
    expect(yearProgress("2024-12-31")).toEqual({ day: 366, daysInYear: 366 });
  });

  it("counts non-leap years", () => {
    expect(yearProgress("2025-03-01")).toEqual({ day: 60, daysInYear: 365 });
    expect(yearProgress("2025-12-31")).toEqual({ day: 365, daysInYear: 365 });
  });

  it("rejects malformed and impossible dates", () => {
    expect(yearProgress("2025-2-01")).toBeNull();
    expect(yearProgress("2025-02-29")).toBeNull();
  });
});
