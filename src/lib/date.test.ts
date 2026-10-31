import { addDays, fromISODate, toISODate } from "./date";

describe("date helpers", () => {
  it("round-trips local ISO dates", () => {
    expect(toISODate(fromISODate("2026-03-08"))).toBe("2026-03-08");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
