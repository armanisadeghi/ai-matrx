"use client";

/**
 * StreamingSkeleton + useStreamingValue — the "before data lands" kit.
 *
 * A kind component receives partial `data` on every envelope flush while the
 * agent streams: fields are absent, arrays are short, strings are cut. The
 * skeleton mimics the layout the real content will have (list / cards /
 * table / text) for the instant before anything arrives; the helpers make
 * field reads tolerant so a component never crashes on a half-built
 * instance and never flickers a value away. Contract:
 * `components/kind-kit/README.md`.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface StreamingSkeletonProps {
  /** Layout to mimic. Default "list". */
  layout?: "list" | "cards" | "table" | "text";
  /** Rows (list/table/text lines) or cards. Default 3. */
  rows?: number;
  /** Columns for "table" / "cards". Default 3 (table) / 2 (cards). */
  columns?: number;
  /** Render a title bar line above the body. Default true. */
  header?: boolean;
  /** Accessible label. Default "Loading". */
  label?: string;
  className?: string;
}

export function StreamingSkeleton({
  layout = "list",
  rows = 3,
  columns,
  header = true,
  label = "Loading",
  className,
}: StreamingSkeletonProps) {
  const n = Math.max(1, rows);
  const cols = Math.max(1, columns ?? (layout === "cards" ? 2 : 3));
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("space-y-2", className)}
    >
      {header && (
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-6 w-16" />
        </div>
      )}
      {layout === "list" &&
        Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border px-2 py-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className={cn("h-3.5", i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/4")} />
          </div>
        ))}
      {layout === "cards" && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 240px), 1fr))` }}
        >
          {Array.from({ length: Math.max(n, cols) }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}
      {layout === "table" && (
        <div className="overflow-hidden rounded-md border border-border">
          <div
            className="grid gap-2 border-b border-border bg-muted/40 px-2 py-1.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3 w-2/3" />
            ))}
          </div>
          {Array.from({ length: n }).map((_, r) => (
            <div
              key={r}
              className="grid gap-2 px-2 py-2"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={cn("h-3", c === 0 ? "w-3/4" : "w-1/2")} />
              ))}
            </div>
          ))}
        </div>
      )}
      {layout === "text" &&
        Array.from({ length: n }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3", i === n - 1 ? "w-2/5" : i % 2 === 0 ? "w-full" : "w-11/12")}
          />
        ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Sticky, tolerant read of a value that may be absent mid-stream.
 *
 * Returns the latest DEFINED value seen (so a re-parse that momentarily drops
 * a field does not blank the UI), `fallback` until one arrives, and `arrived`
 * once any real value has been observed. Implemented with the React
 * "remember the previous render" pattern (state updated during render), so
 * pass a FIELD READ (`data?.summary`) — never an expression that builds a
 * new object/array on every render (`data?.items ?? []`), which would
 * re-trigger the update each render.
 */
export function useStreamingValue<T>(
  value: T | null | undefined,
  fallback: T,
): { value: T; arrived: boolean } {
  const [last, setLast] = React.useState<{ value: T; arrived: boolean }>({
    value: fallback,
    arrived: false,
  });
  const defined = value !== null && value !== undefined;
  if (defined && (!last.arrived || !Object.is(value, last.value))) {
    const next = { value: value as T, arrived: true };
    setLast(next);
    return next;
  }
  return last;
}

/** `value` when it is an array, else `[]` — for `data.items` that is not there yet. */
export function streamList<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** `value` when it is a non-empty string, else `fallback` ("" by default). */
export function streamText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
