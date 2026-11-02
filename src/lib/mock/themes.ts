import type { Api } from "../api";
import type { AnnualTheme, ThemeInput } from "../types";

type ThemesApi = Pick<Api, "listThemes" | "getTheme" | "setTheme" | "deleteTheme">;

const currentYear = new Date().getFullYear();

export function createThemesMock(): ThemesApi {
  const createdAt = new Date().toISOString();
  const themes = new Map<number, AnnualTheme>([
    [
      currentYear,
      {
        year: currentYear,
        title: "Year of Practice",
        description: "Show up consistently, and let small steps compound.",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  ]);

  const validateYear = (year: number) => {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw { kind: "Validation", message: "Year must be between 1900 and 9999." };
    }
  };

  return {
    listThemes: async () => [...themes.values()].sort((a, b) => b.year - a.year),
    getTheme: async (year) => {
      validateYear(year);
      return themes.get(year) ?? null;
    },
    setTheme: async (year, input: ThemeInput) => {
      validateYear(year);
      const title = input.title.trim();
      const description = input.description?.trim() || null;
      if (!title) throw { kind: "Validation", message: "Title is required." };
      if (Array.from(title).length > 80)
        throw { kind: "Validation", message: "Title must be at most 80 characters." };
      if (description && Array.from(description).length > 2000)
        throw { kind: "Validation", message: "Description must be at most 2000 characters." };

      const previous = themes.get(year);
      const timestamp = new Date().toISOString();
      const theme: AnnualTheme = {
        year,
        title,
        description,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      themes.set(year, theme);
      return theme;
    },
    deleteTheme: async (year) => {
      validateYear(year);
      if (!themes.delete(year)) throw { kind: "NotFound", message: `Theme for ${year} not found.` };
    },
  };
}
