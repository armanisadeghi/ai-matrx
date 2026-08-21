import { Skeleton } from "@/components/ui/skeleton";

export default function EducationOverviewLoading() {
  return (
    <div className="h-full overflow-hidden bg-textured px-3 py-3 sm:px-5 sm:py-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
