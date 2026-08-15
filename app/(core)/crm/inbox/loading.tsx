import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/inbox — scope tabs + toolbar + table shape. */
export default function CrmInboxLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="ml-auto h-7 w-28 rounded-md" />
      </div>
      <Skeleton className="mt-2 h-8 w-full rounded-md" />
      <div className="mt-2 flex-1 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
