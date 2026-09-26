"use client";

/**
 * THE rule for every empty view (RC-B12 round 11): "nothing here" is an answer
 * only after a read that SUCCEEDED and returned nothing.
 *
 *   <ReadGate status={readStatusOf(query)} error={query.error} what="your tasks"
 *             isEmpty={tasks.length === 0} empty={<p>No tasks yet.</p>} onRetry={refetch}>
 *     <TaskList tasks={tasks} />
 *   </ReadGate>
 *
 * loading → a wait · error → the failure (with the menu) · ready + empty → the
 * empty view · ready → the rows. When a refresh fails but earlier rows are on
 * screen, the rows stay and the failure is said above them.
 * Guarded by the census `findUngatedEmptyStates` and the lint rule
 * matrx/error-render-carries-alchemy (an empty view under a loading check
 * with no failure check is refused).
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ReadFailure } from "@/components/read-state/ReadFailure";

export type ReadStatus = "loading" | "error" | "ready";

/** The usual shapes a read reports itself in, folded into one status. */
export function readStatusOf(read: {
  status?: string | null;
  isLoading?: boolean;
  loading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: unknown;
}): ReadStatus {
  if (read.isError || (read.error != null && read.error !== false && read.error !== "")) return "error";
  if (read.status === "error" || read.status === "failed") return "error";
  if (read.isLoading || read.loading || read.status === "loading" || read.status === "idle" || read.status === "pending") return "loading";
  return "ready";
}

export function ReadGate({
  status,
  error,
  what = "this list",
  isEmpty,
  empty,
  loading,
  onRetry,
  children,
}: {
  status: ReadStatus;
  error?: unknown;
  what?: string;
  isEmpty: boolean;
  empty: ReactNode;
  loading?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (status === "error") {
    if (isEmpty) return <ReadFailure error={error ?? true} what={what} onRetry={onRetry} />;
    return (
      <>
        <ReadFailure error={error ?? true} what={what} onRetry={onRetry} />
        {children}
      </>
    );
  }
  if (status === "loading" && isEmpty) {
    return (
      loading ?? (
        <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground" role="status" aria-busy="true">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {what}…
        </div>
      )
    );
  }
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
