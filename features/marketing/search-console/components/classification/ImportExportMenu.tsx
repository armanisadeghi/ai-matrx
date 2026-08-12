"use client";

/**
 * Export / import for keyword classifications — the spreadsheet escape hatch
 * done properly (Arman: "if it's not as good as what someone could do in
 * Excel, we look stupid by trying"):
 *
 *   Export CSV        — the FULL filtered set (server-paged fetch, not the
 *                       visible page), classification columns first.
 *   Template CSV      — the import shape with two example rows.
 *   Import CSV…       — papaparse → SERVER dry-run diff (change / unchanged /
 *                       unknown keyword / invalid class / missing mismatch
 *                       notes) → the user applies only after seeing the diff.
 *   Send to workbook  — the canonical `pushTableToWorkbook` (features/
 *                       data-tables, Univer) so edits happen in our own
 *                       sheets app.
 *   Import from workbook… — the round trip back: latest snapshot →
 *                       `univerSnapshotToRows` → the SAME diff dialog.
 *
 * Import matching is by keyword text; classes apply through
 * `gsc_class_import` → `gsc_set_keyword_class` server-side (one mapping).
 */

import { useRef, useState } from "react";
import Papa from "papaparse";
import {
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Table2,
  Upload,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  downloadFile,
  exportFilename,
  rowsToCsv,
} from "@/components/agent-copy/export";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { extractErrorMessage } from "@/utils/errors";
import {
  getGscClassReviewAll,
  importGscKeywordClasses,
  type GscClassImportResultRow,
  type GscClassImportRow,
  type GscClassReviewQuery,
} from "@/features/marketing/search-console/data-classification";
import type { GscDateRange } from "@/features/marketing/search-console/types";

const TEMPLATE_ROWS = [
  {
    keyword: "example: how to recycle electronics",
    class: "educational",
    notes: "Informational query — supporting content.",
  },
  {
    keyword: "example: crt tv disposal service",
    class: "money",
    notes: "",
  },
];

const IMPORT_COLUMNS = [
  { key: "keyword", header: "keyword" },
  { key: "class", header: "class" },
  { key: "notes", header: "notes" },
];

const STATUS_META: Record<string, { label: string; tone: string }> = {
  change: { label: "Will change", tone: "text-success" },
  cleared: { label: "Will clear", tone: "text-warning" },
  unchanged: { label: "Unchanged", tone: "text-muted-foreground" },
  unknown_keyword: { label: "Unknown keyword", tone: "text-destructive" },
  invalid_class: { label: "Invalid class", tone: "text-destructive" },
  missing_notes: { label: "Mismatch needs notes", tone: "text-destructive" },
};

function parseImportRows(
  records: Record<string, string>[],
): GscClassImportRow[] {
  return records
    .map((record) => {
      const lower: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        lower[key.trim().toLowerCase()] = value;
      }
      return {
        query: (lower.keyword ?? lower.query ?? "").trim(),
        class: (lower.class ?? lower.traffic_class ?? "").trim().toLowerCase(),
        notes: (lower.notes ?? "").trim() || null,
      };
    })
    .filter((row) => row.query && !row.query.startsWith("example: "));
}

export function ImportExportMenu({
  siteId,
  siteDomain,
  range,
  query,
  onApplied,
}: {
  siteId: string;
  siteDomain: string;
  range: GscDateRange;
  /** The CURRENT filter state — export honors it. */
  query: Omit<GscClassReviewQuery, "page" | "pageSize">;
  onApplied: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diff, setDiff] = useState<GscClassImportResultRow[] | null>(null);
  const [pendingRows, setPendingRows] = useState<GscClassImportRow[] | null>(
    null,
  );
  const [workbookPick, setWorkbookPick] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [workbookId, setWorkbookId] = useState<string>("");

  const fetchAll = async (label: string) => {
    setBusy(label);
    try {
      const result = await getGscClassReviewAll(siteId, range, query, 20000);
      return result;
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    try {
      const result = await fetchAll("export");
      const rows = result.rows.map((row) => ({
        keyword: row.query,
        class: row.traffic_class,
        notes: row.notes ?? "",
        source: row.class_source,
        impressions_28d: row.impressions,
        clicks_28d: row.clicks,
        ctr: row.ctr ?? "",
        ai_intent: row.intent_class ?? "",
      }));
      downloadFile(
        exportFilename(`keyword-classes-${siteDomain}`, "csv"),
        rowsToCsv(rows),
        "text/csv",
      );
      toast.success(`Exported ${rows.length.toLocaleString()} keywords`, {
        description:
          "Edit the class/notes columns, then Import CSV to apply — you'll see a full diff first.",
      });
    } catch (error) {
      toast.error("Export failed", { description: extractErrorMessage(error) });
    }
  };

  const downloadTemplate = () => {
    downloadFile(
      exportFilename(`keyword-classes-template`, "csv"),
      rowsToCsv(TEMPLATE_ROWS, IMPORT_COLUMNS),
      "text/csv",
    );
  };

  const runDryRun = async (rows: GscClassImportRow[]) => {
    if (rows.length === 0) {
      toast.error("Nothing to import", {
        description:
          "No rows with a keyword found. Expected columns: keyword, class, notes.",
      });
      return;
    }
    setBusy("import");
    try {
      const result = await importGscKeywordClasses(siteId, rows, true);
      setPendingRows(rows);
      setDiff(result);
    } catch (error) {
      toast.error("Import preview failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const onFilePicked = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => void runDryRun(parseImportRows(result.data)),
      error: (error) =>
        toast.error("Could not parse the CSV", { description: error.message }),
    });
  };

  const sendToWorkbook = async () => {
    try {
      const result = await fetchAll("workbook");
      const { pushTableToWorkbook } =
        await import("@/features/data-tables/export-targets");
      const push = await pushTableToWorkbook({
        name: `Keyword classes — ${siteDomain}`,
        headers: [
          "keyword",
          "class",
          "notes",
          "source",
          "impressions_28d",
          "clicks_28d",
        ],
        rows: result.rows.map((row) => [
          row.query,
          row.traffic_class ?? "",
          row.notes ?? "",
          row.class_source ?? "",
          String(row.impressions),
          String(row.clicks),
        ]),
      });
      if (!push.ok || !push.href) {
        throw new Error(push.error ?? "Workbook creation failed");
      }
      toast.success("Workbook created", {
        description:
          "Edit class/notes there, then use “Import from workbook” to apply your changes.",
        action: {
          label: "Open",
          onClick: () => window.open(push.href, "_blank"),
        },
      });
    } catch (error) {
      toast.error("Send to workbook failed", {
        description: extractErrorMessage(error),
      });
    }
  };

  const openWorkbookPicker = async () => {
    setBusy("workbook-list");
    try {
      const { listAccessibleWorkbooks } =
        await import("@/features/data-tables/workbook-service");
      const result = await listAccessibleWorkbooks();
      if (!result.success) {
        throw new Error(result.error);
      }
      setWorkbookPick(
        result.data.map((w) => ({ id: w.id, name: w.workbook_name })),
      );
      setWorkbookId("");
    } catch (error) {
      toast.error("Could not list workbooks", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const importFromWorkbook = async () => {
    if (!workbookId) return;
    setBusy("workbook-import");
    try {
      const [{ getLatestSnapshot }, { univerSnapshotToRows }] =
        await Promise.all([
          import("@/features/data-tables/workbook-service"),
          import("@/features/data-tables/univer-snapshot-rows"),
        ]);
      const snapshot = await getLatestSnapshot(workbookId);
      if (!snapshot.success || !snapshot.data) {
        throw new Error(
          snapshot.success
            ? "The workbook has no saved content yet"
            : snapshot.error,
        );
      }
      const grid = univerSnapshotToRows(snapshot.data.snapshot);
      if (!grid || grid.rows.length < 2) {
        throw new Error("The workbook's first sheet has no data rows");
      }
      const [headers, ...body] = grid.rows;
      const records = body.map((row) =>
        Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])),
      );
      setWorkbookPick(null);
      await runDryRun(parseImportRows(records));
    } catch (error) {
      toast.error("Workbook import failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const applyImport = async () => {
    if (!pendingRows) return;
    setBusy("apply");
    try {
      const result = await importGscKeywordClasses(siteId, pendingRows, false);
      const applied = result.filter(
        (row) => row.status === "change" || row.status === "cleared",
      ).length;
      toast.success(
        `Applied ${applied.toLocaleString()} classification changes`,
      );
      setDiff(null);
      setPendingRows(null);
      onApplied();
    } catch (error) {
      toast.error("Import failed", { description: extractErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const counts = (diff ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const applicable = (counts.change ?? 0) + (counts.cleared ?? 0);
  const diffColumns: MatrxColumnDef<GscClassImportResultRow>[] = [
    {
      id: "query",
      accessorKey: "query",
      header: "Keyword",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <span className="block max-w-72 truncate" title={row.query}>
          {row.query}
        </span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      cell: (row) => {
        const meta = STATUS_META[row.status] ?? {
          label: row.status,
          tone: "text-muted-foreground",
        };
        return <span className={meta.tone}>{meta.label}</span>;
      },
    },
    {
      id: "current_class",
      accessorKey: "current_class",
      header: "Current",
      filter: "select",
      cell: (row) => row.current_class ?? "—",
    },
    {
      id: "new_class",
      accessorKey: "new_class",
      header: "New",
      filter: "select",
      cell: (row) =>
        row.status === "cleared"
          ? "machine decides"
          : row.status === "change"
            ? row.new_class
            : "—",
    },
  ];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFilePicked(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={busy !== null}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            Export / Import
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => void exportCsv()}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV (current filters)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={downloadTemplate}
          >
            <Download className="h-3.5 w-3.5" /> Download import template
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => fileInputRef.current?.click()}
          >
            <FileUp className="h-3.5 w-3.5" /> Import CSV…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => void sendToWorkbook()}
          >
            <Table2 className="h-3.5 w-3.5" /> Send to workbook
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => void openWorkbookPicker()}
          >
            <Upload className="h-3.5 w-3.5" /> Import from workbook…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Workbook picker */}
      <Dialog
        open={workbookPick !== null}
        onOpenChange={(open) => {
          if (!open) setWorkbookPick(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import from workbook</DialogTitle>
            <DialogDescription>
              Pick the workbook holding your edited classifications (first
              sheet, columns: keyword, class, notes). You will see a full diff
              before anything applies.
            </DialogDescription>
          </DialogHeader>
          <Select value={workbookId} onValueChange={setWorkbookId}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Choose a workbook…" />
            </SelectTrigger>
            <SelectContent>
              {(workbookPick ?? []).map((workbook) => (
                <SelectItem
                  key={workbook.id}
                  value={workbook.id}
                  className="text-xs"
                >
                  {workbook.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setWorkbookPick(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!workbookId || busy !== null}
              onClick={() => void importFromWorkbook()}
            >
              Preview changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import diff */}
      <Dialog
        open={diff !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDiff(null);
            setPendingRows(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              {applicable.toLocaleString()} change
              {applicable === 1 ? "" : "s"} will apply
              {counts.unchanged ? ` · ${counts.unchanged} unchanged` : ""}
              {counts.unknown_keyword
                ? ` · ${counts.unknown_keyword} unknown keywords (skipped)`
                : ""}
              {counts.invalid_class
                ? ` · ${counts.invalid_class} invalid classes (skipped)`
                : ""}
              {counts.missing_notes
                ? ` · ${counts.missing_notes} mismatch rows missing notes (skipped)`
                : ""}
              . Nothing applies until you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border p-2">
            <MatrxDataTable
              data={diff ?? []}
              columns={diffColumns}
              getRowId={(row) =>
                `${row.query}:${row.status}:${row.new_class ?? ""}`
              }
              pageSize={25}
              pageSizeOptions={[10, 25, 50, 100]}
              emptyState={{
                title: "No import rows",
                description:
                  "The imported file did not produce any reviewable rows.",
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDiff(null);
                setPendingRows(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={applicable === 0 || busy !== null}
              onClick={() => void applyImport()}
            >
              {busy === "apply" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Apply {applicable.toLocaleString()} change
              {applicable === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
