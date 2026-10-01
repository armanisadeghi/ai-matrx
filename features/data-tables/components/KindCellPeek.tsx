"use client";

/**
 * A kind inside a table cell: its name as a compact chip that opens the value
 * in `structuredValueWindow` (the records grid's own kind cell,
 * `recordsRenderKind`) — never the JSON. A cell that claims a kind but cannot
 * be read says so. See `../utils/kind-cell.ts`.
 */

import { recordsRenderKind } from "@/features/unified-data/recordsReferences";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import type { KindCell } from "../utils/kind-cell";

export function KindCellPeek({
  cell,
  title,
}: {
  cell: KindCell;
  /** The column's name — the window's subtitle. */
  title: string;
}) {
  if (cell.state === "broken") {
    return (
      <span
        className="truncate text-xs text-muted-foreground"
        data-kind-cell-broken=""
      >
        {cell.kind ? `${humanizeKind(cell.kind)} · unreadable` : "Unreadable value"}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 max-w-full items-center" data-kind-cell={cell.kind}>
      {recordsRenderKind({ value: cell.value, kind: cell.kind, where: "cell", title })}
    </span>
  );
}
