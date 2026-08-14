import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the call queue — session strip + dial card. */
export default function CrmDialLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-64 rounded-md" />
        <Skeleton className="ml-auto h-6 w-72 rounded-md" />
      </div>
      <div className="mx-auto mt-2 grid w-full max-w-5xl flex-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-72 w-full rounded-md" />
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
