import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton matches the inner ImageStudioShell layout. The outer chrome
 * (header + pt-10 wrapper) lives in `(tools)/layout.tsx` and is already
 * painted while this skeleton renders.
 */
export default function ConvertLoading() {
  return (
    <div className="h-full min-h-0 flex">
      <div className="hidden md:flex flex-col w-72 lg:w-80 xl:w-96 border-r border-border bg-card/30 min-h-0 p-3 gap-2">
        <Skeleton className="h-8 w-full" />
        <div className="space-y-1 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 p-4 md:p-5">
        <Skeleton className="h-[260px] w-full rounded-2xl" />
      </div>
      <div className="hidden lg:flex flex-col w-80 xl:w-96 min-h-0 border-l border-border p-3 gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
