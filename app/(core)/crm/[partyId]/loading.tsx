import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/[partyId] — identity rail + activity main. */
export default function CrmPartyLoading() {
  return (
    <div
      className="h-full overflow-hidden px-3"
      style={{ paddingTop: "calc(var(--shell-header-h) + 0.5rem)" }}
    >
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(280px,26rem)_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-56 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
