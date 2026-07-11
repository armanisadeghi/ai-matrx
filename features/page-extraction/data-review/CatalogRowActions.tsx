"use client";

/**
 * Per-row Export / Send-to actions on the extraction catalog.
 * Loads the dataset view on demand, then reuses ExportMenu + SendToMenu.
 */

import { useState } from "react";
import { Download, Loader2, MoreHorizontal, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { loadDatasetExportView } from "./data";
import {
  downloadBlob,
  fileSlug,
  toCSV,
  toJSON,
  toXLSXBlob,
  type ExportColumn,
  type ExportRow,
} from "./export";
import { pushToDataset, pushToWorkbook } from "./export-targets";
import {
  OpenDestinationDialog,
  type WindowOverlayDescriptor,
} from "./OpenDestinationDialog";

type LoadedView = {
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
};

type CreatedState = {
  title: string;
  resourceName: string;
  route: string;
  windowOverlay?: WindowOverlayDescriptor;
  note?: string;
};

export function CatalogRowActions({
  jobId,
  rowCount,
}: {
  jobId: string;
  rowCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedState | null>(null);

  const ensureView = async (): Promise<LoadedView | null> => {
    if (rowCount === 0) {
      toast.error("This dataset has no rows yet");
      return null;
    }
    setBusy(true);
    try {
      return await loadDatasetExportView(jobId);
    } catch (e) {
      toast.error("Could not load dataset", {
        description: e instanceof Error ? e.message : undefined,
      });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async (kind: "csv" | "xlsx" | "json") => {
    const view = await ensureView();
    if (!view) return;
    const slug = fileSlug(view.name);
    if (kind === "csv") {
      downloadBlob(
        toCSV(view.columns, view.rows),
        `${slug}.csv`,
        "text/csv;charset=utf-8",
      );
    } else if (kind === "xlsx") {
      downloadBlob(
        toXLSXBlob(view.columns, view.rows, view.name),
        `${slug}.xlsx`,
      );
    } else {
      downloadBlob(
        toJSON(view.columns, view.rows),
        `${slug}.json`,
        "application/json",
      );
    }
  };

  const push = async (target: "workbook" | "dataset") => {
    const view = await ensureView();
    if (!view) return;
    setBusy(true);
    try {
      const res =
        target === "workbook"
          ? await pushToWorkbook(view.name, view.columns, view.rows)
          : await pushToDataset(view.name, view.columns, view.rows);
      if (!res.ok || !res.href) {
        toast.error(
          target === "workbook"
            ? "Could not create workbook"
            : "Could not create data table",
          { description: res.error },
        );
        return;
      }
      setCreated({
        title:
          target === "workbook" ? "Workbook created" : "Data table created",
        resourceName: view.name,
        route: res.href,
        windowOverlay:
          target === "dataset" && res.id
            ? { overlayId: "quickDataWindow", data: { selectedTable: res.id } }
            : undefined,
        note: res.error,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            aria-label="Dataset actions"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel>Download</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={rowCount === 0}
            onSelect={(e) => {
              e.preventDefault();
              void download("csv");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowCount === 0}
            onSelect={(e) => {
              e.preventDefault();
              void download("xlsx");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowCount === 0}
            onSelect={(e) => {
              e.preventDefault();
              void download("json");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Send to</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={rowCount === 0 || busy}
            onSelect={(e) => {
              e.preventDefault();
              void push("workbook");
            }}
          >
            <Send className="mr-2 h-4 w-4" /> Workbook
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={rowCount === 0 || busy}
            onSelect={(e) => {
              e.preventDefault();
              void push("dataset");
            }}
          >
            <Send className="mr-2 h-4 w-4" /> Data table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OpenDestinationDialog
        open={created !== null}
        onOpenChange={(o) => {
          if (!o) setCreated(null);
        }}
        title={created?.title ?? ""}
        resourceName={created?.resourceName}
        route={created?.route ?? "/"}
        windowOverlay={created?.windowOverlay}
        note={created?.note}
      />
    </>
  );
}
