import { Skeleton } from "@ai-matrx/design-system";

export function DesktopBuilderSkeleton() {
  return (
    <div className="h-full overflow-hidden bg-textured p-2 sm:p-3">
      <div className="grid h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,0.95fr)_minmax(26rem,1.15fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:border-r lg:border-b-0">
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full rounded" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
            <div className="flex flex-col gap-2 shrink-0 py-3">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-6 w-48 rounded-md" />
              <Skeleton className="h-6 w-40 rounded-md" />
            </div>
            <div className="flex flex-col gap-2 flex-1 pr-1">
              <Skeleton className="h-[360px] w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
              <Skeleton className="flex-1 w-full rounded-lg" />
            </div>
            <div className="flex items-center justify-end gap-1 shrink-0 py-3 border-t border-border bg-card">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-4 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="mt-2 h-3 w-64 max-w-full rounded" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
            <div className="flex-1 flex items-center justify-center">
              <Skeleton className="h-6 w-32 rounded-md" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileBuilderSkeleton() {
  return (
    <div className="h-full overflow-hidden bg-textured p-3 pt-[var(--shell-header-h)]">
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-20 rounded" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full rounded" />
          <Skeleton className="mt-5 h-56 w-full rounded-lg" />
        </div>
        <div className="min-h-0 flex-1 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="mt-2 h-3 w-56 max-w-full rounded" />
          <Skeleton className="mt-5 h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function RightPanelSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Initializing...
      </div>
    </div>
  );
}
