"use client";

/**
 * The waiting state — the shape of the answer, not a spinner.
 *
 * A search takes about a second, and the platform's rule is that a spinner is
 * never the answer while work happens. So the page shows the sections it is
 * about to fill: the collection header, then result rows in the same rhythm
 * the `web_search_results` components use, so nothing jumps when the real
 * results replace them.
 */

import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function ResultRowSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

export function SearchResultsSkeleton({ query }: { query: string }) {
  return (
    <div className="my-2 space-y-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search className="h-4 w-4" />
        </span>
        <div>
          <div className="text-base font-semibold text-foreground">
            Searching for “{query}”
          </div>
          <div className="text-xs text-muted-foreground">
            Reading the web and shaping the answer…
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <ResultRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
