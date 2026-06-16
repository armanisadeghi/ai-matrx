import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      <Skeleton className="h-8 w-56 rounded-lg" />
      <Skeleton className="h-28 rounded-xl" />
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
