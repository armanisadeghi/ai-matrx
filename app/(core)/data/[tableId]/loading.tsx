"use client";

import { useParams } from "next/navigation";
import { TablePageSkeleton } from "@ai-matrx/records-ui";

/**
 * THE ROUTE'S FIRST FRAME IS THE TABLE PAGE'S OWN SKELETON (lane STABLE-TABLES, Arman 2026-10-06:
 * "They must properly show skeletons and they should not cause shifts"): the same padding the
 * table page sits in (`UnifiedDataTablePage`) and the package's page skeleton, so the frames that
 * follow fill these boxes instead of replacing them. It is given the table's id so a return visit
 * paints the rows that table showed last time (38, not a frame-full 40) — the page's own frame
 * does the same, so the two agree.
 */
export default function Loading() {
  const params = useParams<{ tableId?: string }>();
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <div className="h-full overflow-y-auto px-3 pb-2 pt-1">
        <TablePageSkeleton {...(params?.tableId ? { tableId: params.tableId } : {})} />
      </div>
    </div>
  );
}
