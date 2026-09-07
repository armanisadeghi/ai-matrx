import { Skeleton } from "@ai-matrx/design-system";

export default function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center" aria-label="Loading flashcards">
      <Skeleton className="h-64 w-full max-w-xl rounded-xl" />
    </div>
  );
}
