import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for one sending mailbox — status, gates, health. */
export default function SendingIdentityLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 px-4 pt-[calc(var(--shell-header-h)+1rem)]">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
