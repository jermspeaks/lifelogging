import { save } from "@tauri-apps/plugin-dialog";

export type SaveFilter = { name: string; extensions: string[] };

/** Open a native save dialog in Tauri; mock mode returns a predictable local path. */
export async function chooseSavePath(
  defaultName: string,
  filter: SaveFilter,
): Promise<string | null> {
  if (import.meta.env.VITE_MOCK_API === "1") return `/tmp/${defaultName}`;
  return save({ defaultPath: defaultName, filters: [filter] });
}
