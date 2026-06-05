"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";

import {
  createWorkbook,
  deleteWorkbook,
  listAccessibleWorkbooks,
  saveSnapshot,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";
import { xlsxToUniverWorkbook } from "@/features/data-tables/xlsx-to-univer";

export default function WorkbooksLandingPage() {
  const router = useRouter();
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listAccessibleWorkbooks();
    if (isServiceFailure(res)) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setWorkbooks(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const res = await createWorkbook({ name: "Untitled workbook" });
    setCreating(false);
    if (isServiceFailure(res)) {
      toast({
        title: "Could not create workbook",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    router.push(`/workbooks/${res.data.id}`);
  }, [router]);

  const handleImportXlsx = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        // Parse first — if the file is malformed, we surface the error
        // BEFORE creating an empty workbook the user would have to delete.
        const snapshot = await xlsxToUniverWorkbook(file);

        const cleanName = file.name.replace(/\.[^.]+$/, "") || "Imported workbook";
        const created = await createWorkbook({
          name: cleanName,
          description: `Imported from ${file.name}`,
          source: file.name.toLowerCase().endsWith(".csv")
            ? "imported_csv"
            : "imported_xlsx",
        });
        if (isServiceFailure(created)) throw new Error(created.error);

        const saved = await saveSnapshot({
          workbookId: created.data.id,
          snapshot,
          origin: "imported",
          label: file.name,
        });
        if (isServiceFailure(saved)) {
          // Roll back the workbook so we don't leave an empty husk on import
          // failure. Best-effort.
          await deleteWorkbook(created.data.id);
          throw new Error(saved.error);
        }

        toast({
          title: "Workbook imported",
          description: cleanName,
          variant: "success",
        });
        router.push(`/workbooks/${created.data.id}`);
      } catch (err) {
        toast({
          title: "Could not import workbook",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setImporting(false);
        // Reset the file input so the same file can be selected again later.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [router],
  );

  const handleDelete = useCallback(
    async (wb: Workbook) => {
      const ok = await confirm({
        title: "Delete workbook?",
        description: `"${wb.workbook_name}" and all of its saved snapshots will be permanently removed.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
      const res = await deleteWorkbook(wb.id);
      if (isServiceFailure(res)) {
        toast({
          title: "Could not delete workbook",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Workbook deleted", variant: "success" });
      void reload();
    },
    [reload],
  );

  return (
    <div className="w-full h-page p-4 space-y-4 overflow-y-auto scrollbar-none">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h1 className="text-2xl font-bold">Workbooks</h1>
          <p className="text-sm text-muted-foreground">
            Lossless spreadsheets — multi-sheet, formulas, formatting. Each
            workbook autosaves and syncs in realtime to anyone with access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportXlsx(f);
            }}
          />
          <Button
            variant="outline"
            disabled={importing || creating}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import XLSX / CSV
          </Button>
          <Button onClick={handleCreate} disabled={creating || importing}>
            {creating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            New workbook
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && workbooks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <FileSpreadsheet className="size-8" />
            <div className="text-sm">No workbooks yet.</div>
            <div className="text-xs">
              Click <span className="font-medium">New workbook</span> to create
              one.
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && workbooks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((wb) => (
            <Card key={wb.id} className="group">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex flex-1 items-start gap-2 text-left"
                    onClick={() => router.push(`/workbooks/${wb.id}`)}
                  >
                    <FileSpreadsheet className="size-5 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {wb.workbook_name}
                      </div>
                      {wb.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {wb.description}
                        </div>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                    onClick={() => handleDelete(wb)}
                    title="Delete workbook"
                  >
                    <Trash className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(wb.updated_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
