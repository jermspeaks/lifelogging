import { Database, FileJson, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { chooseSavePath } from "@/lib/dialog";
import { useDataInfo, useExportDatabase, useExportJson } from "@/lib/queries";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

function localDateName(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Settings() {
  const { data, isPending, error } = useDataInfo();
  const exportDatabase = useExportDatabase();
  const exportJson = useExportJson();
  const [activeExport, setActiveExport] = useState<"database" | "json" | null>(null);

  async function saveExport(kind: "database" | "json") {
    setActiveExport(kind);
    try {
      const date = localDateName();
      const path = await chooseSavePath(
        `lifelogging-${date}.${kind === "database" ? "db" : "json"}`,
        {
          name: kind === "database" ? "SQLite database" : "JSON export",
          extensions: kind === "database" ? ["db"] : ["json"],
        },
      );
      if (!path) return;
      const result =
        kind === "database"
          ? await exportDatabase.mutateAsync(path)
          : await exportJson.mutateAsync(path);
      toast.success(`Saved to ${result.path}`);
    } catch (error) {
      toast.error(`Couldn't export data: ${errorMessage(error)}`);
    } finally {
      setActiveExport(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <section className="space-y-4 rounded-lg border p-5" aria-labelledby="data-heading">
        <div>
          <h2 id="data-heading" className="font-medium">
            Data
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data is stored locally on this device.
          </p>
        </div>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading database information…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load database information: {errorMessage(error)}
          </p>
        ) : data ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Database location</dt>
            <dd className="select-all break-all font-mono">{data.dbPath}</dd>
            <dt className="text-muted-foreground">Database size</dt>
            <dd>{formatBytes(data.sizeBytes)}</dd>
            <dt className="text-muted-foreground">Schema version</dt>
            <dd>{data.schemaVersion}</dd>
          </dl>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={activeExport !== null}
            onClick={() => void saveExport("database")}
          >
            {activeExport === "database" ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Database aria-hidden="true" />
            )}
            {activeExport === "database" ? "Saving backup…" : "Back up database…"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={activeExport !== null}
            onClick={() => void saveExport("json")}
          >
            {activeExport === "json" ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <FileJson aria-hidden="true" />
            )}
            {activeExport === "json" ? "Exporting JSON…" : "Export JSON…"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          To restore a backup, quit the app and replace <code>lifelogging.db</code> with your saved
          database file.
        </p>
      </section>
    </div>
  );
}
