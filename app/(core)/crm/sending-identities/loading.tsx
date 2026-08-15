import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for /crm/sending-identities — mirrors the intro + mailbox cards. */
export default function SendingIdentitiesLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pt-[calc(var(--shell-header-h)+1rem)]">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-10 w-full max-w-2xl rounded-md" />
        <Skeleton className="h-9 w-40 shrink-0 rounded-md" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
