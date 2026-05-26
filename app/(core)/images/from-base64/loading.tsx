import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton matches the inner FromBase64 shell layout. The outer chrome
 * (header + pt-10 wrapper) lives in `(tools)/layout.tsx` and is already
 * painted while this skeleton renders.
 */
export default function FromBase64Loading() {
  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="flex-1 min-h-[280px] w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 min-h-0">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}
