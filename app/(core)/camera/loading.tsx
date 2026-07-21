import { Skeleton } from "@/components/ui/skeleton";

export default function CameraLoading() {
  return (
    <div className="h-full overflow-hidden bg-textured">
      <div className="flex h-full min-h-0 flex-col gap-3 p-3 pt-[var(--shell-header-h)]">
        <Skeleton className="min-h-[320px] w-full shrink-0 rounded-lg md:min-h-[420px]" />
        <div className="grid shrink-0 grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
