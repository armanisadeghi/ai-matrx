"use client";

/**
 * features/page-extraction/data-review/SendToMenu.tsx
 *
 * The discoverable "push this dataset into another Matrx system" control — a
 * first-class header button (not buried inside the Export download menu). Today:
 *
 *   • Workbook   → udt_workbooks (our spreadsheet system). Routing-only, so the
 *                  open chooser offers Here / New tab.
 *   • Data table → udt_datasets (typed user table). Has a window-panel surface
 *                  (`quickDataWindow`), so the chooser ALSO offers Open as window.
 *
 * On success it never silently navigates — it raises OpenDestinationDialog so
 * the user decides how to open the freshly-created resource.
 */

import { useState } from "react";
import { FileSpreadsheet, Loader2, Send, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ExportColumn, ExportRow } from "./export";
import { pushToDataset, pushToWorkbook } from "./export-targets";
import {
  OpenDestinationDialog,
  type WindowOverlayDescriptor,
} from "./OpenDestinationDialog";

type Target = "workbook" | "dataset";

interface CreatedState {
  title: string;
  resourceName: string;
  route: string;
  windowOverlay?: WindowOverlayDescriptor;
  note?: string;
}

export function SendToMenu({
  name,
  columns,
  rows,
  disabled,
}: {
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  disabled?: boolean;
}) {
  const [pushing, setPushing] = useState<Target | null>(null);
  const [created, setCreated] = useState<CreatedState | null>(null);
  const empty = rows.length === 0 || columns.length === 0;

  const push = async (target: Target) => {
    setPushing(target);
    try {
      const res =
        target === "workbook"
          ? await pushToWorkbook(name, columns, rows)
          : await pushToDataset(name, columns, rows);

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
        resourceName: name,
        route: res.href,
        windowOverlay:
          target === "dataset" && res.id
            ? { overlayId: "quickDataWindow", data: { selectedTable: res.id } }
            : undefined,
        note: res.error,
      });
    } finally {
      setPushing(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || empty || !!pushing}
          >
            {pushing ? (
              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
            ) : (
              <Send className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Send to</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Push this dataset to…</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!!pushing}
            onSelect={(e) => {
              e.preventDefault();
              void push("workbook");
            }}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Workbook (spreadsheet)
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!pushing}
            onSelect={(e) => {
              e.preventDefault();
              void push("dataset");
            }}
          >
            <Table2 className="mr-2 h-4 w-4" /> Data table
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
