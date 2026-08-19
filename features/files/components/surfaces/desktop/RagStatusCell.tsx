/**
 * features/files/components/surfaces/desktop/RagStatusCell.tsx
 *
 * Compact "Knowledge" cell rendered inside the file table when the user
 * enables the Knowledge-status column. Reads `cloudFiles.ragStatus.byFileId`
 * — the column header (or column-settings) is responsible for kicking
 * off the prefetch thunk; this cell is purely presentational.
 *
 * Visual language:
 *   - Indexed     → green dot + "Indexed"
 *   - Not indexed → muted dot + "Not indexed"
 *   - Pending     → spinner + "Checking…"
 *   - Unknown     → em-dash + "—"
 */

"use client";

import { Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectRagStatusForFile } from "@/features/files/redux/selectors";

export interface RagStatusCellProps {
  fileId: string;
  className?: string;
}

export function RagStatusCell({ fileId, className }: RagStatusCellProps) {
  const status = useAppSelector((s) => selectRagStatusForFile(s, fileId));

  if (!status || status === "unknown") {
    return (
      <span
        className={cn("text-xs text-muted-foreground/60", className)}
        title="Knowledge status not yet checked — toggle the column on or click Refresh."
      >
        —
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-muted-foreground",
          className,
        )}
        title="Checking Knowledge indexing status…"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Checking…
      </span>
    );
  }

  if (status === "indexed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary",
          className,
        )}
        title="Indexed for Knowledge search"
      >
        <Lightbulb className="h-3 w-3" aria-hidden="true" />
        Indexed
      </span>
    );
  }

  // not_indexed
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
      title="File has not been ingested for Knowledge yet."
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
      />
      Not indexed
    </span>
  );
}
