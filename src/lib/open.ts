import { openUrl } from "@tauri-apps/plugin-opener";

/** Open a URL in the system browser in Tauri and a new tab in the mock browser. */
export async function openExternal(url: string): Promise<void> {
  if (import.meta.env.VITE_MOCK_API === "1") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await openUrl(url);
}
