"use client";

/**
 * DerivativeResultsDialog — the full-screen surface for inspecting a knowledge
 * asset's output (table rows, chunks, summaries, Q&A) at real size.
 *
 * Replaces the old card-in-a-card inline expander (a ~280px box inside a 1/3-
 * page drawer that crammed 1,101 rows into 320px of height and capped at 200).
 * Here the viewer gets the whole viewport: scroll all rows, search, see page
 * provenance. Opened from the "View N …" button on each representation card.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableRowsViewer } from "./TableRowsViewer";
import { DerivativeChunkList } from "./ChunkList";

export function DerivativeResultsDialog({
  open,
  onOpenChange,
  kind,
  derivativeId,
  title,
  total,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Derivation kind — only "table_row" gets the grid view; others list chunks. */
  kind: string;
  derivativeId: string;
  title: string;
  total?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[90vh] w-[96vw] max-w-[1500px] flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border/60 px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-sm">
            {title}
            {total ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal tabular-nums text-muted-foreground">
                {total.toLocaleString()}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          {kind === "table_row" ? (
            <TableRowsViewer derivativeId={derivativeId} expectedTotal={total} />
          ) : (
            <div className="h-full overflow-auto p-3">
              <DerivativeChunkList
                derivativeId={derivativeId}
                expectedTotal={total}
                limit={500}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
