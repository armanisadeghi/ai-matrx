import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/campaigns — toolbar + table shape. */
export default function CrmCampaignsLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-72 rounded-md" />
        <Skeleton className="ml-auto h-7 w-32 rounded-md" />
      </div>
      <div className="mt-2 flex-1 space-y-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    </div>
  );
}
