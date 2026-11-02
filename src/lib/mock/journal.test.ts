import { addDays, todayLocal } from "../date";
import { createJournalMock } from "./journal";

describe("journal mock", () => {
  it("seeds three past entries and supports text save, delete, and paging", async () => {
    const api = createJournalMock();
    const today = todayLocal();
    const seeded = await api.listJournalEntries();
    expect(seeded).toHaveLength(3);
    expect(seeded[0].date).toBe(addDays(today, -1));

    const saved = await api.saveJournalEntry(today, today, "  first\nsecond  ");
    expect(saved).toMatchObject({ date: today, body: "  first\nsecond  ", wordCount: 2 });
    expect(await api.getJournalEntry(today, today)).toEqual(saved);
    expect((await api.listJournalEntries("FIRST"))[0]).toMatchObject({ date: today, wordCount: 2 });
    expect((await api.listJournalEntries(undefined, today, 1))[0].date).toBe(addDays(today, -1));

    expect(await api.saveJournalEntry(today, today, " \n\t ")).toBeNull();
    expect(await api.getJournalEntry(today, today)).toBeNull();
    await api.deleteJournalEntry(addDays(today, -1));
    expect((await api.listJournalEntries()).map((entry) => entry.date)).not.toContain(
      addDays(today, -1),
    );
  });

  it("validates future dates, body length, literal search, and list limits", async () => {
    const api = createJournalMock();
    const today = todayLocal();
    await expect(api.getJournalEntry(addDays(today, 1), today)).rejects.toMatchObject({
      kind: "Validation",
    });
    await expect(api.saveJournalEntry(today, today, "x".repeat(100_001))).rejects.toMatchObject({
      kind: "Validation",
    });
    await api.saveJournalEntry(today, today, "match %_\\ literally");
    expect(await api.listJournalEntries("%_\\")).toHaveLength(1);
    expect(await api.listJournalEntries("%xx")).toHaveLength(0);
    await expect(api.listJournalEntries(undefined, undefined, 201)).rejects.toMatchObject({
      kind: "Validation",
    });
  });
});
