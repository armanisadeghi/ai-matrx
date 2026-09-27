// Route loading state for a deck (page-pass 2026-09-27): opening a deck from
// the list used to leave the old list on screen for a second or two with no
// sign anything was happening. Shaped like the deck page: header, actions,
// card grid.
import { Skeleton } from "@ai-matrx/design-system";

export default function FlashcardDeckLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-5"
      role="status"
      aria-label="Opening deck"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-8 w-80" />
      </div>
      <Skeleton className="mt-3 h-4 w-96" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
