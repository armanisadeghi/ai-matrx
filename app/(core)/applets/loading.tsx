import { Skeleton } from "@ai-matrx/design-system";

/** The list's shape while it loads: the lane row, then table rows. */
export default function AppletsLoading() {
  return (
    <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]" role="status" aria-label="Loading Applets">
      <div className="space-y-2 px-4 py-3">
        <Skeleton className="h-7 w-72" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
