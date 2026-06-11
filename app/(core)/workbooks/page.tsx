"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
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
import { fileHandler } from "@/features/files/handler/handler";
import {
  detectImportRoute,
  type ImportRouteDetection,
  type ImportRouting,
} from "@/features/data-tables/smart-importer";
import { ImportRouteDialog } from "@/features/data-tables/components/ImportRouteDialog";
import { smartImportPickupSlot } from "@/features/data-tables/smart-import-pickup";

export default function WorkbooksLandingPage() {
  const router = useRouter();
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Smart-import state: separate file picker pointed at the same accept set
  // but funnels through detectImportRoute() before committing.
  const smartFileInputRef = useRef<HTMLInputElement | null>(null);
  const [smartDetection, setSmartDetection] =
    useState<ImportRouteDetection | null>(null);
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartDialogOpen, setSmartDialogOpen] = useState(false);
  const [smartCommitting, setSmartCommitting] = useState(false);

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

        // Stash the lossless original in cld_files so users can download or
        // re-import the source later. Failure here is non-fatal — the workbook
        // import path is the primary deliverable, the original-file link is
        // a recoverability nicety (FK is ON DELETE SET NULL, so we'd nil out
        // the link if the file went away anyway). Log + continue on failure.
        let originalFileId: string | undefined;
        try {
          const uploaded = await fileHandler.upload(
            { kind: "file", file },
            { folderPath: "Workbooks/Imports" },
          );
          originalFileId = uploaded.fileId;
        } catch (uploadErr) {
          console.warn(
            "Workbook import: stashing original failed; continuing without link.",
            uploadErr,
          );
        }

        const cleanName = file.name.replace(/\.[^.]+$/, "") || "Imported workbook";
        const created = await createWorkbook({
          name: cleanName,
          description: `Imported from ${file.name}`,
          source: file.name.toLowerCase().endsWith(".csv")
            ? "imported_csv"
            : "imported_xlsx",
          originalFileId,
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

  const handleSmartImport = useCallback(async (file: File) => {
    // Reset the input so picking the same file again still fires onChange.
    if (smartFileInputRef.current) smartFileInputRef.current.value = "";
    setSmartCommitting(false);

    try {
      const detection = await detectImportRoute(file);
      setSmartFile(file);
      setSmartDetection(detection);
      setSmartDialogOpen(true);
    } catch (err) {
      toast({
        title: "Could not analyze file",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }, []);

  const handleSmartCommit = useCallback(
    async (routing: ImportRouting) => {
      if (!smartFile) return;
      setSmartCommitting(true);
      try {
        if (routing === "workbook") {
          setSmartDialogOpen(false);
          await handleImportXlsx(smartFile);
        } else {
          // Typed-dataset routing — the rich import/preview/column-config
          // flow lives at /data. Stash the file briefly on the window so
          // /data can pick it up (sessionStorage holds the filename and a
          // pickup token; the actual File is non-serializable so it rides
          // on a global module-level slot).
          smartImportPickupSlot.file = smartFile;
          smartImportPickupSlot.takenAt = Date.now();
          setSmartDialogOpen(false);
          toast({
            title: "Opening in typed-data import",
            description: smartFile.name,
            variant: "default",
          });
          router.push("/data?smartImport=1");
        }
      } finally {
        setSmartCommitting(false);
        setSmartFile(null);
        setSmartDetection(null);
      }
    },
    [smartFile, router],
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
      {/* Mobile: title row stacks above a single button row that wraps
          cleanly. The wide `pr-10` reservation existed for a desktop side
          drawer hit-area; on small screens it crushed the button row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pr-10">
        <h1 className="text-2xl font-bold">Workbooks</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <input
            ref={smartFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleSmartImport(f);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importing || creating || smartCommitting}
            onClick={() => smartFileInputRef.current?.click()}
            title="Auto-detect whether your file is a typed dataset or a workbook"
          >
            <Sparkles className="h-4 w-4 sm:mr-2" />
            {/* Hide labels on phones; keep icons + tooltips. */}
            <span className="hidden sm:inline">Smart import</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importing || creating || smartCommitting}
            onClick={() => fileInputRef.current?.click()}
            title="Import XLSX or CSV"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Import XLSX / CSV</span>
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || importing || smartCommitting}
            title="New workbook"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">New workbook</span>
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

      <ImportRouteDialog
        isOpen={smartDialogOpen}
        onClose={() => {
          if (!smartCommitting) {
            setSmartDialogOpen(false);
            setSmartFile(null);
            setSmartDetection(null);
          }
        }}
        detection={smartDetection}
        fileName={smartFile?.name ?? ""}
        onCommit={handleSmartCommit}
        isCommitting={smartCommitting}
      />
    </div>
  );
}
