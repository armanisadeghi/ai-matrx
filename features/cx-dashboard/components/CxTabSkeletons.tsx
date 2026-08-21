// Honest, layout-matched skeletons for the CX dashboard tabs.
//
// Server Components (no "use client") — each mirrors the real tab's geometry
// (real section headings, same paddings/heights) so route transitions paint
// instantly with zero layout shift. Used by BOTH each tab's loading.tsx and
// the in-page <Suspense> fallback around the awaited data child.

import { Skeleton } from "@/components/ui/skeleton";

function FiltersBarSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-56 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
      <div className="flex-1" />
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-8 w-20 rounded-md" />
    </div>
  );
}

function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="border border-border rounded-md bg-card">
      <div className="px-3 py-2 border-b border-border">
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="p-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Overview tab: KPI grid + two chart panels + tables. */
export function CxOverviewSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading overview metrics">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-md p-3 bg-card space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Daily Requests</h3>
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="border border-border rounded-md p-3 bg-card space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Daily Cost</h3>
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}

/** Usage & Cost tab: header line + filters + charts + model table. */
export function CxUsageSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading usage and cost analytics">
      <h2 className="text-sm font-semibold">
        Usage &amp; Cost Analytics
        <Skeleton className="inline-block h-3.5 w-64 ml-2 align-middle" />
      </h2>
      <FiltersBarSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-md p-3 bg-card space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Daily Cost Trend</h3>
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="border border-border rounded-md p-3 bg-card space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground">Daily Token Usage</h3>
          <Skeleton className="h-[200px] w-full" />
        </div>
      </div>
      <div className="border border-border rounded-md bg-card">
        <div className="px-3 py-2 border-b border-border">
          <h3 className="text-xs font-medium text-muted-foreground">Usage by Model</h3>
        </div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Conversations tab: filters + data table. */
export function CxConversationsSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading conversations">
      <FiltersBarSkeleton />
      <TableSkeleton rows={12} />
    </div>
  );
}

/** Requests tab: filters + data table. */
export function CxRequestsSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading user requests">
      <FiltersBarSkeleton />
      <TableSkeleton rows={12} />
    </div>
  );
}

/** Errors tab: two stacked tables (problem requests, tool-call errors). */
export function CxErrorsSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading error reports">
      <TableSkeleton rows={8} />
      <TableSkeleton rows={8} />
    </div>
  );
}

/** Conversation / request detail pages: header block + content sections. */
export function CxDetailSkeleton() {
  return (
    <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading detail">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}
