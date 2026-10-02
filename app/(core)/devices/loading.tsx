/** The list's own frame, empty: same gutter, radius and 64px rows, so nothing moves on arrival. */
export default function DevicesLoading() {
  return (
    <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-2xl px-4">
        <div className="pb-2 pt-1 lg:hidden">
          <div className="h-[41px] w-40 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="overflow-hidden rounded-[10px] border border-border bg-card lg:mt-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex h-16 items-center gap-3 border-b border-border/60 px-4 last:border-b-0">
              <div className="h-10 w-10 animate-pulse rounded-[9px] bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
