import type { Api } from "../api";

type QuotesApi = Pick<
  Api,
  "listQuotes" | "createQuote" | "updateQuote" | "deleteQuote" | "importQuotes" | "getDailyQuote"
>;

export function createQuotesMock(): QuotesApi {
  return {
    listQuotes: async () => [],
    createQuote: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
    updateQuote: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
    deleteQuote: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
    importQuotes: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
    getDailyQuote: async () => null,
  };
}
