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
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";

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

/**
 * A read's outcome handed to a list/table primitive (RC-B12 round 13). Every
 * primitive that takes an `emptyState` also takes `read?: ReadOutcome` and
 * renders the empty state only when `status === "ready"`: "error" with no rows
 * → <ReadFailure/> with the retry; "error" with rows → the rows under a stale
 * notice; "loading" with no rows → loading. Structurally identical to the
 * design-system table's `MatrxDataTableRead`, so one value serves both.
 */
export interface ReadOutcome {
  status: ReadStatus;
  /** The failure itself, or a truthy flag when the read only says it failed. */
  error?: unknown;
  onRetry?: (() => void) | undefined;
  /** What was read, in the reader's words: "your tasks". */
  what?: string | undefined;
  /**
   * A successful read has already produced a value (rows, a count). Then a
   * refetch in flight is not "loading" and a failed refresh is not "no value":
   * counts keep their last known value (with the stale mark) — the same
   * stale-while-error rule as rows (RC-B12 r13 ruling).
   */
  hasData?: boolean | undefined;
}

type ReadLike = Parameters<typeof readStatusOf>[0] & {
  refetch?: () => unknown;
  retry?: () => unknown;
  /** The read's value (react-query `data`, a hook's rows) — present means a read already landed. */
  data?: unknown;
  /** react-query: when the data last arrived (0 = never). */
  dataUpdatedAt?: number;
  /** A hook that tracks it directly. */
  hasData?: boolean;
};

/** Has a successful read already produced a value? */
function readHasData(read: ReadLike): boolean {
  if (typeof read.hasData === "boolean") return read.hasData;
  if (typeof read.dataUpdatedAt === "number" && read.dataUpdatedAt > 0) return true;
  // An empty array is often a hook's initial placeholder, not an answer — it
  // proves nothing was read; only a hook's own `hasData`/`dataUpdatedAt` can.
  if (Array.isArray(read.data)) return read.data.length > 0;
  return read.data !== undefined && read.data !== null;
}

/**
 * Fold a query/hook result into a `ReadOutcome`:
 *   <MatrxDataTable data={rows} emptyState={…} read={readOf(query, { what: "your tasks" })} />
 * The retry is the read's own `refetch` / `retry` unless `onRetry` is given.
 */
export function readOf(read: ReadLike, options: { what?: string; onRetry?: () => void } = {}): ReadOutcome {
  const again = options.onRetry ?? read.refetch ?? read.retry;
  return {
    status: readStatusOf(read),
    error: read.error ?? (read.isError ? true : undefined),
    ...(again ? { onRetry: () => void again() } : {}),
    ...(options.what ? { what: options.what } : {}),
    hasData: readHasData(read),
  };
}

export function ReadGate({
  read,
  status: statusProp,
  error: errorProp,
  what: whatProp,
  isEmpty,
  empty,
  loading,
  onRetry: onRetryProp,
  children,
}: {
  /**
   * The read's outcome in one value — what a list primitive's `read` prop
   * carries. Absent (and no `status`), the gate is "ready": a primitive whose
   * caller passed no read renders exactly as before.
   */
  read?: ReadOutcome | undefined;
  status?: ReadStatus;
  error?: unknown;
  what?: string;
  isEmpty: boolean;
  empty: ReactNode;
  loading?: ReactNode;
  onRetry?: (() => void) | undefined;
  children: ReactNode;
}) {
  const status = statusProp ?? read?.status ?? "ready";
  const error = errorProp ?? read?.error;
  const what = whatProp ?? read?.what ?? "this list";
  const onRetry = onRetryProp ?? read?.onRetry;
  if (status === "error") {
    if (isEmpty) return <ReadFailure error={error ?? true} what={what} onRetry={onRetry} />;
    // Rows from an earlier read stay; the notice says they may be out of date.
    return (
      <>
        {onRetry ? (
          <StaleDataNotice hasData what={what} onRetry={onRetry} className="mb-2" />
        ) : (
          <ReadFailure error={error ?? true} what={what} />
        )}
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

/**
 * A list primitive's EMPTY branch (RC-B12 round 13): the failure while its read
 * failed, the wait while it loads, and the primitive's own empty view only
 * after a read that succeeded. No `read` → the empty view, as before.
 *
 *   if (items.length === 0) return <ReadEmpty read={read}>{emptyState}</ReadEmpty>;
 */
export function ReadEmpty({ read, loading, children }: { read?: ReadOutcome | undefined; loading?: ReactNode; children?: ReactNode }) {
  return (
    <ReadGate read={read} isEmpty empty={children ?? null} {...(loading === undefined ? {} : { loading })}>
      {null}
    </ReadGate>
  );
}

/**
 * Above a primitive's ROWS: when the latest read failed, the rows on screen are
 * from an earlier read — say so (StaleDataNotice with its retry), never blank them.
 */
export function ReadStaleNotice({ read, className }: { read?: ReadOutcome | undefined; className?: string }) {
  if (read?.status !== "error") return null;
  const what = read.what ?? "this list";
  if (!read.onRetry) return <ReadFailure error={read.error ?? true} what={what} {...(className ? { className } : {})} />;
  return <StaleDataNotice hasData what={what} onRetry={read.onRetry} {...(className ? { className } : {})} />;
}
