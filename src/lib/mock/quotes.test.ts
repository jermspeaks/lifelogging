import { describe, expect, it } from "vitest";

import { createQuotesMock } from "./quotes";

describe("quotes mock", () => {
  it("imports case-insensitive duplicates once and clears optional fields with blank patches", async () => {
    const api = createQuotesMock();
    const result = await api.importQuotes("Keep this — Writer\n keep THIS — writer \nAnother");

    expect(result).toEqual({ imported: 2, skipped: 1 });
    const imported = (await api.listQuotes()).find((quote) => quote.text === "Keep this");
    expect(imported?.author).toBe("Writer");
    if (!imported) throw new Error("Expected the imported quote");

    const updated = await api.updateQuote(imported.id, { author: "", source: "  " });
    expect(updated.author).toBeNull();
    expect(updated.source).toBeNull();
  });

  it("rejects a bad import line without adding earlier valid lines", async () => {
    const api = createQuotesMock();
    const before = await api.listQuotes();

    await expect(api.importQuotes('A valid quote\n""')).rejects.toMatchObject({
      kind: "Validation",
      message: expect.stringContaining("Line 2"),
    });
    expect(await api.listQuotes()).toEqual(before);
  });

  it("uses the epoch-based daily index and returns null for an empty collection", async () => {
    const api = createQuotesMock();
    const ordered = [...(await api.listQuotes())].sort((a, b) => a.id - b.id);

    expect(await api.getDailyQuote("1970-01-01")).toEqual(ordered[0]);
    expect(await api.getDailyQuote("1969-12-31")).toEqual(ordered[2]);

    for (const quote of await api.listQuotes()) await api.deleteQuote(quote.id);
    expect(await api.getDailyQuote("1970-01-01")).toBeNull();
  });
});
