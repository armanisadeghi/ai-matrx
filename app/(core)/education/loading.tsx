// Suspense fallback for the Education Hub. Keeps the page frame stable while
// server content resolves (component-library skeleton, never "Loading…").
import { Skeleton } from "@/components/ui/skeleton";

export default function EducationLoading() {
  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-14 sm:pt-20 pb-10 text-center">
        <Skeleton className="mx-auto h-7 w-40 rounded-full" />
        <Skeleton className="mx-auto mt-6 h-12 w-3/4 max-w-2xl" />
        <Skeleton className="mx-auto mt-4 h-12 w-2/3 max-w-xl" />
        <Skeleton className="mx-auto mt-8 h-11 w-44 rounded-md" />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
