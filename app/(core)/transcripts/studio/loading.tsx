import { Skeleton } from "@ai-matrx/design-system";

export default function TranscriptStudioLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-2xl space-y-3 px-4" aria-label="Loading transcript studio">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
