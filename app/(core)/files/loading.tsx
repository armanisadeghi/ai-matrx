/**
 * app/(a)/files/loading.tsx
 *
 * Zero-layout-shift skeleton — matches the final PageShell structure exactly:
 *   sidebar (280px) + breadcrumbs row + list rows.
 *
 * Obeys `ssr-zero-layout-shift` — same outer dimensions as the rendered DOM
 * so swapping to content doesn't reflow.
 */

import { Skeleton } from "@/components/ui/skeleton";

export default function CloudFilesLoading() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-[280px] shrink-0 border-r flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex flex-col gap-px p-1 overflow-hidden">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="h-6 flex items-center gap-2 px-2 rounded"
              style={{ paddingLeft: `${(i % 3) * 14 + 4}px` }}
            >
              <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
              <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
              <Skeleton
                className="h-3.5 rounded"
                style={{ width: `${40 + ((i * 13) % 40)}%` }}
              />
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Breadcrumbs row */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-3.5 w-16 rounded" />
          </div>
          <Skeleton className="h-7 w-[88px] rounded-md" />
        </div>

        {/* List header */}
        <div className="grid grid-cols-[auto_1fr_100px_120px_auto] items-center gap-3 px-3 py-1.5 border-b bg-muted/40 shrink-0">
          <Skeleton className="h-3 w-4 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-10 rounded justify-self-end" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-5 rounded" />
        </div>

        {/* List rows */}
        <div className="flex-1 overflow-hidden">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_100px_120px_auto] items-center gap-3 px-3 py-1.5 border-b border-border/50"
            >
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton
                className="h-4 rounded"
                style={{ width: `${40 + ((i * 17) % 50)}%` }}
              />
              <Skeleton className="h-3 w-12 rounded justify-self-end" />
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-4 w-5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
