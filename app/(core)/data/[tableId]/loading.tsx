import { TablePageSkeleton } from "@ai-matrx/records-ui";

/**
 * THE ROUTE'S FIRST FRAME IS THE TABLE PAGE'S OWN SKELETON (lane STABLE-TABLES, Arman 2026-10-06:
 * "They must properly show skeletons and they should not cause shifts"): the same padding the
 * table page sits in (`UnifiedDataTablePage`) and the package's page skeleton, so the frames that
 * follow fill these boxes instead of replacing them.
 */
export default function Loading() {
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <div className="h-full overflow-y-auto px-3 pb-2 pt-1">
        <TablePageSkeleton />
      </div>
    </div>
  );
}
