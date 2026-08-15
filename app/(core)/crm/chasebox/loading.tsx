import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/chasebox — scope tabs + the five queue cards + the list. */
export default function CrmChaseboxLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="ml-auto h-7 w-24 rounded-md" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
      <div className="mt-3 flex-1 space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
