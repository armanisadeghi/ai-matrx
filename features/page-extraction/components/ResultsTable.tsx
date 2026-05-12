/**
 * features/page-extraction/components/ResultsTable.tsx
 *
 * Dynamic table for extraction results. Columns are derived from the
 * Job's `output_schema`. Rows are `page_extraction_results.payload`.
 *
 * Clicking a row jumps the parent surface to the result's canonical_page
 * (the PDF Extractor wires this to `setActivePage`).
 */

"use client";

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getJob } from "@/features/page-extraction/api/jobs";
import { useExtractionResults } from "@/features/page-extraction/hooks/useExtractionResults";
import {
  columnLabel,
  schemaColumns,
  unwrapArraySchema,
} from "@/features/page-extraction/utils/schema-validation";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import type {
  FlatObjectSchema,
  PageExtractionJob,
} from "@/features/page-extraction/types";
import { useEffect, useState } from "react";

export interface ResultsTableProps {
  jobId: string | null;
  /** Optional page filter — when set, shows only results referencing this page. */
  pageNumber?: number | null;
  /** Click a row → jump to the canonical_page. */
  onJumpToPage?: (page: number) => void;
}

export function ResultsTable({
  jobId,
  pageNumber,
  onJumpToPage,
}: ResultsTableProps) {
  const [job, setJob] = useState<PageExtractionJob | null>(null);
  const { results, loading, error } = useExtractionResults(jobId, {
    pageNumber,
  });

  useEffect(() => {
    let cancelled = false;
    if (!jobId) {
      setJob(null);
      return;
    }
    void getJob(jobId).then((j) => {
      if (!cancelled) setJob(j);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const schema = useMemo<FlatObjectSchema | null>(
    () => unwrapArraySchema(job?.output_schema),
    [job?.output_schema],
  );
  const cols = useMemo(() => schemaColumns(schema), [schema]);

  if (!jobId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Pick or create an extraction job to see results.
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading results…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load results: {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No results yet. Run the job to start extracting.
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16 text-xs">Page</TableHead>
            {cols.map((key) => (
              <TableHead key={key} className="text-xs">
                {columnLabel(key, schema)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => {
            const payload = (r.payload ?? {}) as Record<string, unknown>;
            const canJump =
              typeof r.canonical_page === "number" && r.canonical_page > 0;
            return (
              <TableRow
                key={r.id}
                className={canJump ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => {
                  if (canJump && onJumpToPage)
                    onJumpToPage(r.canonical_page as number);
                }}
              >
                <TableCell className="text-xs tabular-nums">
                  {r.canonical_page ??
                    formatPageRange(
                      Array.isArray(r.source_pages) ? r.source_pages : [],
                    )}
                </TableCell>
                {cols.map((key) => (
                  <TableCell key={key} className="text-xs align-top">
                    {renderCell(payload[key])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function renderCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
