import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useDeleteTheme, useThemes } from "@/lib/queries";
import type { AnnualTheme } from "@/lib/types";
import { ThemeDialog } from "@/widgets/themes/ThemeDialog";

export default function Themes() {
  const { data: themes, isPending, error } = useThemes();
  const remove = useDeleteTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AnnualTheme | null>(null);
  const [addYear, setAddYear] = useState(new Date().getFullYear());
  const [deleting, setDeleting] = useState<AnnualTheme | null>(null);

  const openNew = () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const nextYearExists = (themes ?? []).some((theme) => theme.year === nextYear);
    setEditing(null);
    setAddYear(nextYear <= 9999 && !nextYearExists ? nextYear : currentYear);
    setDialogOpen(true);
  };

  const openEdit = (theme: AnnualTheme) => {
    setEditing(theme);
    setAddYear(theme.year);
    setDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Annual themes</h1>
          <p className="text-sm text-muted-foreground">Choose a focus for each year.</p>
        </div>
        <Button onClick={openNew}>
          <Plus />
          Add theme
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading themes…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn't load themes: {errorMessage(error)}
        </p>
      ) : themes && themes.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {themes.map((theme) => (
            <li key={theme.year} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {theme.year} · {theme.title}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                  {theme.description || "No description"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${theme.year} theme`}
                  onClick={() => openEdit(theme)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${theme.year} theme`}
                  onClick={() => setDeleting(theme)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <p className="font-medium">No annual themes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a theme to give the year a direction.
          </p>
          <Button className="mt-4" variant="outline" onClick={openNew}>
            <Plus />
            Add theme
          </Button>
        </div>
      )}

      <ThemeDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        theme={editing}
        initialYear={addYear}
        allowYearEdit={!editing}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.year} theme?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{deleting?.title}”. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                const theme = deleting;
                remove.mutate(theme.year, {
                  onSuccess: () => setDeleting(null),
                  onError: (e) => toastDeleteError(e),
                });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete theme"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function toastDeleteError(error: unknown) {
  toast.error(`Couldn't delete theme: ${errorMessage(error)}`);
}
