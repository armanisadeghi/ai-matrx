import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/deals — mirrors the toggle strip + board columns. */
export default function CrmDealsLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-40 rounded-md" />
        <Skeleton className="ml-auto h-7 w-40 rounded-md" />
      </div>
      <div className="mt-3 flex flex-1 gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-full w-64 shrink-0 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
