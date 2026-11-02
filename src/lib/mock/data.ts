import type { Api } from "../api";

type DataApi = Pick<Api, "getDataInfo" | "exportDatabase" | "exportJson">;

export function createDataMock(): DataApi {
  return {
    getDataInfo: async () => ({ dbPath: "/tmp/lifelogging.db", sizeBytes: 0, schemaVersion: 5 }),
    exportDatabase: async (path) => ({ path, bytes: 0 }),
    exportJson: async (path) => ({ path, bytes: 0 }),
  };
}
