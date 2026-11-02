import type { Api } from "../api";

type ThemesApi = Pick<Api, "listThemes" | "getTheme" | "setTheme" | "deleteTheme">;

export function createThemesMock(): ThemesApi {
  return {
    listThemes: async () => [],
    getTheme: async () => null,
    setTheme: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
    deleteTheme: async () => {
      throw { kind: "Validation", message: "not implemented" };
    },
  };
}
