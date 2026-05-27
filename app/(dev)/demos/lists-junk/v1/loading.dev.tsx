import { Skeleton } from "@/components/ui/skeleton";

function SidebarSkeleton() {
  return (
    <div className="hidden md:flex flex-col w-72 lg:w-80 flex-shrink-0 border-r border-border bg-card h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <Skeleton className="h-8 w-full rounded-md" />
      </div>

      {/* List items */}
      <div className="flex-1 p-2 space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 px-4 lg:px-6 py-4 space-y-6 max-w-4xl">
        {Array.from({ length: 2 }).map((_, groupIdx) => (
          <div key={groupIdx} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="h-3 w-3 rounded" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-6" />
            </div>
            <div className="space-y-1.5 pl-2">
              {Array.from({ length: 3 + groupIdx }).map((_, itemIdx) => (
                <div
                  key={itemIdx}
                  className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card"
                >
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                  <div className="flex gap-1">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <Skeleton className="h-6 w-6 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ListsLoading() {
  return (
    <div className="flex h-full">
      <SidebarSkeleton />
      <ContentSkeleton />
    </div>
  );
}
