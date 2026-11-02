import type { Api } from "../api";
import type { ErrorPayload } from "../types";

type NotesApi = Pick<
  Api,
  | "listNotes"
  | "createNote"
  | "updateNote"
  | "reviewNote"
  | "setNoteArchived"
  | "deleteNote"
  | "getReviewQueue"
>;

function notImplemented(): never {
  throw { kind: "Validation", message: "Notes are not implemented yet." } satisfies ErrorPayload;
}

export function createNotesMock(): NotesApi {
  return {
    listNotes: async () => [],
    createNote: async () => notImplemented(),
    updateNote: async () => notImplemented(),
    reviewNote: async () => notImplemented(),
    setNoteArchived: async () => notImplemented(),
    deleteNote: async () => notImplemented(),
    getReviewQueue: async () => ({ due: [], dueCount: 0 }),
  };
}
