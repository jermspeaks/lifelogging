import type { Api } from "../api";

type JournalApi = Pick<
  Api,
  "getJournalEntry" | "saveJournalEntry" | "deleteJournalEntry" | "listJournalEntries"
>;

export function createJournalMock(): JournalApi {
  return {
    getJournalEntry: async () => null,
    saveJournalEntry: async () => null,
    deleteJournalEntry: async () => {},
    listJournalEntries: async () => [],
  };
}
