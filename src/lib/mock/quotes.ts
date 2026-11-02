import type { Api } from "../api";
import type { ErrorPayload, ImportQuotesResult, NewQuote, Quote, QuotePatch } from "../types";

type QuotesApi = Pick<
  Api,
  "listQuotes" | "createQuote" | "updateQuote" | "deleteQuote" | "importQuotes" | "getDailyQuote"
>;

function fail(kind: ErrorPayload["kind"], message: string): never {
  throw { kind, message } satisfies ErrorPayload;
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function validate(input: NewQuote) {
  const text = input.text.trim();
  if (text.length === 0 || Array.from(text).length > 1_000)
    fail("Validation", "Quote text must be 1–1,000 characters");
  if (Array.from(input.author?.trim() ?? "").length > 200)
    fail("Validation", "Author must be at most 200 characters");
  if (Array.from(input.source?.trim() ?? "").length > 200)
    fail("Validation", "Source must be at most 200 characters");
}

function parseImport(text: string): NewQuote[] {
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.at(-1) === "" && text.endsWith("\n")) lines.pop();
  if (lines.length > 1_000) fail("Validation", "Import may contain at most 1,000 lines");
  const output: NewQuote[] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const delimiters = [" — ", " -- ", " ~ "]
      .map((value) => ({ value, index: line.lastIndexOf(value) }))
      .filter(({ index: at }) => at >= 0)
      .sort((a, b) => b.index - a.index);
    const delimiter = delimiters[0];
    const quotePart = delimiter ? line.slice(0, delimiter.index) : line;
    let quoteText = quotePart.trim();
    const pairs = [
      ['"', '"'],
      ["'", "'"],
      ["“", "”"],
      ["‘", "’"],
    ];
    for (const [open, close] of pairs) {
      if (quoteText.startsWith(open) && quoteText.endsWith(close)) {
        quoteText = quoteText.slice(open.length, quoteText.length - close.length).trim();
        break;
      }
    }
    const input: NewQuote = {
      text: quoteText,
      ...(delimiter ? { author: line.slice(delimiter.index + delimiter.value.length).trim() } : {}),
    };
    try {
      validate(input);
    } catch (error) {
      if (typeof error === "object" && error !== null && "message" in error)
        fail("Validation", `Line ${index + 1}: ${String(error.message)}`);
      throw error;
    }
    output.push(input);
  });
  return output;
}

function duplicateKey(text: string, author: string | null) {
  return `${text.trim().toLowerCase()}\u0000${author?.trim().toLowerCase() ?? ""}`;
}

export function createQuotesMock(): QuotesApi {
  let nextId = 4;
  const timestamp = () => new Date().toISOString();
  const seededAt = timestamp();
  const quotes = new Map<number, Quote>([
    [
      1,
      {
        id: 1,
        text: "The secret of getting ahead is getting started.",
        author: "Mark Twain",
        source: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
    [
      2,
      {
        id: 2,
        text: "It always seems impossible until it's done.",
        author: "Nelson Mandela",
        source: null,
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
    [
      3,
      {
        id: 3,
        text: "Well done is better than well said.",
        author: "Benjamin Franklin",
        source: "Poor Richard's Almanack",
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ],
  ]);

  function create(input: NewQuote): Quote {
    validate(input);
    const now = timestamp();
    const quote: Quote = {
      id: nextId++,
      text: input.text.trim(),
      author: clean(input.author),
      source: clean(input.source),
      createdAt: now,
      updatedAt: now,
    };
    quotes.set(quote.id, quote);
    return { ...quote };
  }

  function mustGet(id: number): Quote {
    const quote = quotes.get(id);
    if (!quote) fail("NotFound", `Quote ${id} not found`);
    return quote;
  }

  return {
    listQuotes: async () => [...quotes.values()].sort((a, b) => b.id - a.id).map((q) => ({ ...q })),
    createQuote: async (input) => create(input),
    updateQuote: async (id, patch: QuotePatch) => {
      const current = mustGet(id);
      const nextInput: NewQuote = {
        text: patch.text !== undefined ? patch.text : current.text,
        author: patch.author != null ? patch.author : (current.author ?? undefined),
        source: patch.source != null ? patch.source : (current.source ?? undefined),
      };
      validate(nextInput);
      const updated: Quote = {
        ...current,
        text: nextInput.text.trim(),
        author: clean(nextInput.author),
        source: clean(nextInput.source),
        updatedAt: timestamp(),
      };
      quotes.set(id, updated);
      return { ...updated };
    },
    deleteQuote: async (id) => {
      mustGet(id);
      quotes.delete(id);
    },
    importQuotes: async (text) => {
      const inputs = parseImport(text);
      const known = new Set([...quotes.values()].map((q) => duplicateKey(q.text, q.author)));
      const accepted: NewQuote[] = [];
      let skipped = 0;
      for (const input of inputs) {
        const key = duplicateKey(input.text, clean(input.author));
        if (known.has(key)) skipped++;
        else {
          known.add(key);
          accepted.push(input);
        }
      }
      accepted.forEach((input) => create(input));
      return { imported: accepted.length, skipped } satisfies ImportQuotesResult;
    },
    getDailyQuote: async (today) => {
      const parsed = new Date(`${today}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
        Number.isNaN(parsed.valueOf()) ||
        parsed.toISOString().slice(0, 10) !== today
      )
        fail("Validation", "Date must be a valid YYYY-MM-DD date");
      const ordered = [...quotes.values()].sort((a, b) => a.id - b.id);
      if (ordered.length === 0) return null;
      const day = Math.floor(parsed.valueOf() / 86_400_000);
      const index = ((day % ordered.length) + ordered.length) % ordered.length;
      return { ...ordered[index] };
    },
  };
}
