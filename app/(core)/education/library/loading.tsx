// Suspense fallback for the Community Library — the one education segment with
// a real server fetch (decks + admin status) and NO notFound()-capable child,
// so a segment loading boundary is safe here. Do NOT add a loading.tsx to any
// education segment that contains a dynamic [slug] page calling notFound()
// (learn/, exam-prep/, subjects/): the boundary would flush the shell at
// HTTP 200 before the page can decide not-found, recreating soft-404 D36.
import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
