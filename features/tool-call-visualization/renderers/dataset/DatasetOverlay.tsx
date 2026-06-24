"use client";

import { useMemo } from "react";
import { Table2, ExternalLink } from "lucide-react";
import UserTableViewer from "@/components/user-generated-table-data/UserTableViewer";
import type { ToolRendererProps } from "../../types";
import { parseDataset } from "./parseDataset";

/**
 * Overlay renderer for `dataset` / `usertable_create` — the real table rendered
 * with the canonical `UserTableViewer` (rows, sorting, filtering), self-loading
 * by id. Falls back to a message when there's no usable id (e.g. the
 * backend-broken `usertable_create` that returns an error in place of table_id).
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
      <UserTableViewer tableId={ds.id} />
    </div>
  );
}
