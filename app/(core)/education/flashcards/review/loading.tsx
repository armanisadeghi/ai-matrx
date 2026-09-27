// Route loading state (page-pass 2026-09-27): the header's link to this page
// shows it at once instead of leaving the flashcards list on screen.
import { Skeleton } from "@ai-matrx/design-system";

export default function FlashcardsSubpageLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 w-full" />
    </div>
  );
}
