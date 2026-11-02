import { describe, expect, it } from "vitest";

import { addDays, todayLocal } from "../date";
import { createNotesMock } from "./notes";

describe("Notes mock API", () => {
  it("seeds a due queue and excludes future notes", async () => {
    const api = createNotesMock();
    const today = todayLocal();
    const queue = await api.getReviewQueue(today, 5);
    expect(queue.dueCount).toBe(2);
    expect(queue.due).toHaveLength(2);
    expect(queue.due.every((note) => note.nextReviewDate! <= today)).toBe(true);
    expect(
      (await api.listNotes(undefined, false)).some(
        (note) => note.nextReviewDate === addDays(today, 4),
      ),
    ).toBe(true);
  });

  it("creates, edits, reviews, archives, restores, searches, and deletes notes", async () => {
    const api = createNotesMock();
    const today = "2026-10-31";
    const created = await api.createNote(
      {
        title: "  https://example.test/read  ",
        url: "https://example.test/read",
        body: " Remember this. ",
      },
      today,
    );
    expect(created.title).toBe("https://example.test/read");
    expect(created.body).toBe("Remember this.");
    expect(created.nextReviewDate).toBe("2026-11-01");

    const updated = await api.updateNote(created.id, { body: "", title: "Useful link" });
    expect(updated.body).toBeNull();
    expect(updated.nextReviewDate).toBe(created.nextReviewDate);
    expect(updated.title).toBe("Useful link");

    const kept = await api.reviewNote(created.id, today, "keep");
    expect(kept.reviewStage).toBe(1);
    expect(kept.nextReviewDate).toBe("2026-11-03");
    expect(kept.lastReviewedOn).toBe(today);
    const snoozed = await api.reviewNote(created.id, today, "snooze");
    expect(snoozed.reviewStage).toBe(1);
    expect(snoozed.nextReviewDate).toBe("2026-11-01");

    const archived = await api.setNoteArchived(created.id, true, today);
    expect(archived.nextReviewDate).toBeNull();
    await expect(api.reviewNote(created.id, today, "keep")).rejects.toMatchObject({
      kind: "Validation",
    });
    expect((await api.listNotes("example.test", true)).map((note) => note.id)).toContain(
      created.id,
    );
    expect((await api.listNotes(undefined, false)).map((note) => note.id)).not.toContain(
      created.id,
    );

    const restored = await api.setNoteArchived(created.id, false, today);
    expect(restored.reviewStage).toBe(0);
    expect(restored.nextReviewDate).toBe("2026-11-01");
    await api.deleteNote(created.id);
    expect((await api.listNotes(undefined, true)).map((note) => note.id)).not.toContain(created.id);
  });

  it("validates URL authority, dates, and queue limits", async () => {
    const api = createNotesMock();
    await expect(
      api.createNote({ title: "Bad", url: "https:///path" }, "2026-10-31"),
    ).rejects.toMatchObject({ kind: "Validation" });
    await expect(api.createNote({ title: "Bad" }, "2026-2-1")).rejects.toMatchObject({
      kind: "Validation",
    });
    await expect(api.getReviewQueue("2026-10-31", 51)).rejects.toMatchObject({
      kind: "Validation",
    });
  });
});
