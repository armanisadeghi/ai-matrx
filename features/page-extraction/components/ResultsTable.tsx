/**
 * features/page-extraction/components/ResultsTable.tsx
 *
 * Dynamic table for extraction results. Columns are derived from the
 * Job's `output_schema`. Rows are `page_extraction_results.payload`.
 *
 * Two modes:
 *   • Single template (jobId is a real job UUID) — fetches results for
 *     that job, columns come from the job's output_schema (with a
 *     payload-key fallback when the schema is empty).
 *   • All extractions (jobId === EXTRACTIONS_ALL_VIEW) — fetches every
 *     result row for the file across every template, adds a `Template`
 *     column, and unions payload keys across all jobs.
 *
 * Header bar carries a "Clear data" affordance that wipes the template's
 * results without touching the template itself. The Clear button only
 * makes sense in single-template mode and is hidden in All-view (clearing
 * all data for a file would be too destructive a one-click action).
 * Clicking a result row jumps the parent surface to the result's
 * canonical_page.
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
import { useExtractionResultsForFile } from "@/features/page-extraction/hooks/useExtractionResultsForFile";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import {
  columnLabel,
  schemaColumns,
  unwrapArraySchema,
} from "@/features/page-extraction/utils/schema-validation";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import { isAllJobsView } from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  FlatObjectSchema,
  PageExtractionJob,
} from "@/features/page-extraction/types";

export interface ResultsTableProps {
  /**
   * Either a real Job UUID, the `EXTRACTIONS_ALL_VIEW` sentinel for the
   * cross-template aggregate, or null when nothing has been picked yet.
   */
  jobId: string | null;
  /**
   * Required for the All view (so the cross-template hook knows which
   * file to fetch). Single-template mode ignores this.
   */
  fileId: string | null;
  pageNumber?: number | null;
  onJumpToPage?: (page: number) => void;
}

export function ResultsTable({
  jobId,
  fileId,
  pageNumber,
  onJumpToPage,
}: ResultsTableProps) {
  const isAll = isAllJobsView(jobId);

  return isAll ? (
    <AllResultsTable
      fileId={fileId}
      pageNumber={pageNumber}
      onJumpToPage={onJumpToPage}
    />
  ) : (
    <SingleJobResultsTable
      jobId={jobId}
      pageNumber={pageNumber}
      onJumpToPage={onJumpToPage}
    />
  );
}

// ─── Single-job mode (the original table) ────────────────────────────────

function SingleJobResultsTable({
  jobId,
  pageNumber,
  onJumpToPage,
}: {
  jobId: string | null;
  pageNumber?: number | null;
  onJumpToPage?: (page: number) => void;
}) {
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
        ' for "' +
        templateName +
        '"? The template itself stays - only the extracted data is removed.',
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
      <div className="p-4 text-sm text-muted-foreground">
        Loading results...
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

  const rowCountLabel =
    results.length + " row" + (results.length === 1 ? "" : "s");

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

// ─── All-extractions mode (cross-template aggregate) ─────────────────────

function AllResultsTable({
  fileId,
  pageNumber,
  onJumpToPage,
}: {
  fileId: string | null;
  pageNumber?: number | null;
  onJumpToPage?: (page: number) => void;
}) {
  const { results, loading, error } = useExtractionResultsForFile(fileId);
  const { jobs } = useExtractionJobs(fileId);

  // Quick lookup: job id → name. Templates that were soft-deleted but
  // produced results show up as "(archived)" so the rows still render
  // identifiably.
  const jobNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const j of jobs) map.set(j.id, j.name);
    return map;
  }, [jobs]);

  // Union of payload keys across every result row, ordered by first
  // appearance. Per-template schemas vary, so we collapse to "show every
  // column anyone has emitted" — empty cells are expected and fine.
  const cols = useMemo(() => {
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
  }, [results]);

  const filtered = useMemo(() => {
    if (!pageNumber) return results;
    return results.filter(
      (r) =>
        Array.isArray(r.source_pages) && r.source_pages.includes(pageNumber),
    );
  }, [results, pageNumber]);

  if (!fileId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Load a document to see extractions.
      </div>
    );
  }

  if (loading && results.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading results…</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load results: {error}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No extraction results yet for this file. Run a template to see rows
        appear here.
      </div>
    );
  }

  const rowCountLabel =
    filtered.length + " row" + (filtered.length === 1 ? "" : "s");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/40">
        <span className="text-[10px] text-muted-foreground">
          {rowCountLabel} across {jobs.length} template
          {jobs.length === 1 ? "" : "s"}
          {pageNumber != null ? " (filtered to page " + pageNumber + ")" : ""}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          All extractions
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-xs">Page</TableHead>
              <TableHead className="text-xs">Template</TableHead>
              {cols.map((key) => (
                <TableHead key={key} className="text-xs">
                  {prettifyKey(key)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
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
                  <TableCell className="text-xs text-muted-foreground">
                    {jobNameById.get(r.job_id) ?? "(archived)"}
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

function prettifyKey(key: string): string {
  // Snake/kebab → Title Case. Cheap fallback when there's no schema to
  // pull a polished label from (`columnLabel` requires a schema).
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
