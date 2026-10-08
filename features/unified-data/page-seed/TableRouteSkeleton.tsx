// features/unified-data/page-seed/TableRouteSkeleton.tsx — lane SSR-ROWS-3
//
// THE TABLE ROUTE'S FIRST FRAME (lane STABLE-TABLES): the padding the table page sits in
// (`UnifiedDataTablePage`) and the package's page skeleton, given the table's id so a return visit
// paints the rows that table showed last time. One component, drawn by the route's `loading.tsx`
// AND by the table page while it waits for its first reads, so the two frames are the same box.

import { TablePageSkeleton } from "@ai-matrx/records-ui";

export function TableRouteSkeleton({ tableId }: { tableId?: string | null }) {
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <div className="h-full overflow-y-auto px-3 pb-2 pt-1">
        <TablePageSkeleton {...(tableId ? { tableId } : {})} />
      </div>
    </div>
  );
}
