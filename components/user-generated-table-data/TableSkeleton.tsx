"use client";

import React from "react";

interface TableSkeletonProps {
  /** Number of data columns to render (excludes the trailing Actions column). */
  columns?: number;
  /** Number of placeholder body rows. Most tables show 3-5+ rows. */
  rows?: number;
  /** Render the trailing fixed-width "Actions" column placeholder. */
  showActions?: boolean;
  className?: string;
}

const bar = "h-3.5 rounded bg-muted/40 animate-pulse";

/**
 * Table-shaped loading placeholder. Mirrors the real UDT table's chrome
 * (rounded bordered shell, sticky-style header band, min-width data columns,
 * fixed Actions column) so the skeleton occupies the same footprint the loaded
 * table will — no collapsed single-line → full-table layout jump.
 *
 * Semantic-token only (`bg-muted/40`, `border-border`, `bg-muted/30`). Exported
 * so any surface rendering a similar data grid can reuse it.
 */
export function TableSkeleton({
  columns = 5,
  rows = 5,
  showActions = true,
  className,
}: TableSkeletonProps) {
  const colCount = Math.max(1, columns);
  const rowCount = Math.max(1, rows);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-border shadow-sm ${className ?? ""}`}
      aria-hidden="true"
    >
      <table className="w-full table-fixed">
        <thead>
          <tr className="bg-muted/30">
            {Array.from({ length: colCount }).map((_, i) => (
              <th
                key={i}
                className="min-w-[150px] border-b border-border px-3 py-2.5 text-left"
              >
                <div className="space-y-1.5">
                  <div className={`${bar} w-2/3`} />
                  <div className="h-2 w-1/3 rounded bg-muted/30 animate-pulse" />
                </div>
              </th>
            ))}
            {showActions && (
              <th className="w-[140px] border-b border-border px-3 py-2.5">
                <div className={`${bar} mx-auto w-12`} />
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, r) => (
            <tr
              key={r}
              className={`border-b border-border/60 ${r % 2 === 1 ? "bg-muted/10" : ""}`}
            >
              {Array.from({ length: colCount }).map((_, c) => (
                <td key={c} className="px-3 py-3">
                  {/* Vary widths a little so it reads as data, not a grid. */}
                  <div
                    className={bar}
                    style={{ width: `${[88, 62, 75, 50, 80][(r + c) % 5]}%` }}
                  />
                </td>
              ))}
              {showActions && (
                <td className="px-3 py-3">
                  <div className="flex justify-center gap-1.5">
                    <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                    <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                    <div className="h-5 w-5 rounded bg-muted/40 animate-pulse" />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TableSkeleton;
