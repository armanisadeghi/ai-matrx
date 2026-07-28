import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm — mirrors the tabs + toolbar + table shape. */
export default function CrmLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-64 rounded-md" />
        <Skeleton className="ml-auto h-7 w-52 rounded-md" />
      </div>
      <Skeleton className="mt-2 h-8 w-full rounded-md" />
      <div className="mt-2 flex-1 space-y-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
