/** Geometry-preserving loading state shared by the route boundary and grid. */
export function AgentAppsGridSkeleton() {
  return (
    <div role="status" aria-label="Loading agent apps" className="space-y-4">
      <span className="sr-only">Loading agent apps</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-8 min-w-52 flex-1 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-44 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-48 animate-pulse space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="h-7 w-7 rounded-lg bg-muted" />
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-3/5 rounded bg-muted" />
            <div className="mt-auto h-11 w-full rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
