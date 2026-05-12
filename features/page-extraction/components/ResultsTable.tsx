/**
 * features/page-extraction/components/ResultsTable.tsx
 *
 * Dynamic table for extraction results. Columns are derived from the
 * Job's `output_schema`. Rows are `page_extraction_results.payload`.
 *
 * Header bar carries a "Clear data" affordance that wipes the template's
 * results without touching the template itself. Clicking a result row
 * jumps the parent surface to the result's canonical_page.
 */

"use client";

import { useMemo, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToastManager } from "@/hooks/useToastManager";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { clearJobResults, getJob } from "@/features/page-extraction/api/jobs";
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

export interface ResultsTableProps {
  jobId: string | null;
  pageNumber?: number | null;
  onJumpToPage?: (page: number) => void;
}

export function ResultsTable({
  jobId,
  pageNumber,
  onJumpToPage,
}: ResultsTableProps) {
  const [job, setJob] = useState<PageExtractionJob | null>(null);
  const [clearing, setClearing] = useState(false);
  const toast = useToastManager("page-extraction");
  const { results, loading, error, refetch } = useExtractionResults(jobId, {
    pageNumber,
  });

  const handleClearData = async () => {
    if (!jobId) return;
    const rowWord = results.length === 1 ? "row" : "rows";
    const templateName = job?.name ?? "this template";
    const ok = await confirm({
      title: "Clear extraction data",
      description:
        "Delete " +
        results.length +
        " result " +
        rowWord +
        " for \"" +
        templateName +
        "\"? The template itself stays - only the extracted data is removed.",
      confirmLabel: "Clear data",
      variant: "destructive",
    });
    if (!ok) return;
    setClearing(true);
    try {
      await clearJobResults(jobId);
      refetch();
      toast.success("Cleared extraction data");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  };

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
  const schemaCols = useMemo(() => schemaColumns(schema), [schema]);

  /**
   * When the Job's output_schema has no properties (or the schema is just
   * `{ type: "object", properties: {} }` — common when the user hasn't
   * defined columns explicitly), fall back to the UNION of keys across
   * all result payloads. This is the difference between "rows exist but
   * the table looks empty" and "I can see my data."
   *
   * We sort keys by their first occurrence in the result set so the
   * column order is stable across renders.
   */
  const cols = useMemo(() => {
    if (schemaCols.length > 0) return schemaCols;
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const r of results) {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(payload)) {
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      }
    }
    return ordered;
  }, [schemaCols, results]);

  if (!jobId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Pick or create an extraction job to see results.
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading results...</div>
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

  const rowCountLabel = results.length + " row" + (results.length === 1 ? "" : "s");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/40">
        <span className="text-[10px] text-muted-foreground">
          {rowCountLabel}
          {pageNumber != null ? " (filtered to page " + pageNumber + ")" : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
          disabled={clearing}
          onClick={() => void handleClearData()}
          title="Delete every result row for this template (template stays)"
        >
          {clearing ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3 mr-1" />
          )}
          Clear data
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
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
