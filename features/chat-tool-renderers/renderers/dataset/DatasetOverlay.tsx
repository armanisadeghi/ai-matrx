"use client";

import { useMemo } from "react";
import { Table2, ExternalLink } from "lucide-react";
// Located first (lane INTEG-CLIENTS): a moved or custom table opens from its own store.
import LocatedTableViewer from "@/features/data-tables/components/LocatedTableViewer";
import type { ToolRendererProps } from "@ai-matrx/chat/tool-call-visualization/types";
import { parseDataset } from "./parseDataset";

/**
 * Overlay renderer for the `dataset` tool — the real table rendered
 * with the store grid (`LocatedTableViewer`: rows, sorting, filtering), self-loading
 * by id. Falls back to a message when there's no usable id (e.g. a result
 * that carries an error in place of the table id).
 */
export function DatasetOverlay({ entry }: ToolRendererProps) {
  const ds = useMemo(() => parseDataset(entry), [entry]);

  if (!ds.id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <Table2 className="h-6 w-6" />
        <span>
          {ds.name
            ? `"${ds.name}" — table data isn't available to preview.`
            : "No table to display."}
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <LocatedTableViewer tableId={ds.id} />
    </div>
  );
}
