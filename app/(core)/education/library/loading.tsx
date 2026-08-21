// Suspense fallback for the authenticated canonical artifact Library.
import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="h-full w-full bg-textured px-3 py-3">
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <Skeleton className="mt-3 h-9 w-full" />
      <Skeleton className="mt-3 h-[28rem] w-full" />
    </div>
  );
}
