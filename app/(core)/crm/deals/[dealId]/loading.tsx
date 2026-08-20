import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/deals/[dealId] — stage strip + two-column record. */
export default function CrmDealLoading() {
  return (
    <div className="h-full overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,26rem)_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-48 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
