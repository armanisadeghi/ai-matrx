import { Skeleton } from "@/components/ui/skeleton";

export default function WidgetsLoading() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[260px] shrink-0 border-r border-border flex flex-col p-3 gap-2 hidden md:flex">
        <Skeleton className="h-6 w-full rounded-md" />
        <Skeleton className="h-6 w-full rounded-md" />
        <Skeleton className="h-6 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
      <div className="flex-1 p-4 space-y-3 overflow-hidden">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    </div>
  );
}
