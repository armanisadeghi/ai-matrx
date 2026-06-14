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
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveRunByJob,
  selectResultsRefreshNonce,
} from "@/features/page-extraction/redux/selectors";
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
import { updateResultPayloadField } from "@/features/page-extraction/api/runs";
import { useExtractionResults } from "@/features/page-extraction/hooks/useExtractionResults";
import { useExtractionResultsForFile } from "@/features/page-extraction/hooks/useExtractionResultsForFile";
import { useExtractionJobs } from "@/features/page-extraction/hooks/useExtractionJobs";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import {
  buildMergedDuplicateView,
  cellValueFor,
  COLUMN_SOURCE_META,
  inferColumnsFromRows,
  normalizeResultRows,
  parseTemplateColumns,
} from "@/features/page-extraction/utils/columns";

// Stable empty map so the no-duplicates path doesn't allocate a new
// reference each render.
const EMPTY_MERGED_COUNTS: Map<string, number> = new Map();
import { isAllJobsView } from "@/features/page-extraction/redux/pageExtractionSlice";
import type {
  ExtractionColumn,
  PageExtractionJob,
  PageExtractionResult,
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
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const toast = useToastManager("page-extraction");
  const { results, loading, error, refetch } = useExtractionResults(jobId, {
    pageNumber,
  });

  // Auto-refetch as the run produces output. Realtime INSERTs handle the
  // happy path, but a fast run can finish before the channel finishes
  // subscribing — so the table would sit empty until a manual reload. We
  // also pull the authoritative rows when a run reaches a terminal state
  // (completed/failed), since result rows are written server-side and the
  // run-progress signal is the most reliable "data is ready now" trigger.
  const runStatus = useAppSelector(
    (s) => selectActiveRunByJob(s, jobId)?.status ?? null,
  );
  const completedChunks = useAppSelector(
    (s) => selectActiveRunByJob(s, jobId)?.completedChunks ?? 0,
  );
  useEffect(() => {
    if (completedChunks > 0 || runStatus === "completed") refetch();
    // `refetch` is recreated each render; depending on it would loop. The
    // run-progress signals above are the intended triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedChunks, runStatus]);

  // Refetch when results are deleted out-of-band (e.g. an entire run is
  // deleted) — Realtime doesn't reliably deliver DELETEs.
  const resultsNonce = useAppSelector(selectResultsRefreshNonce);
  useEffect(() => {
    if (resultsNonce > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsNonce]);

  // Defensive: the backend persists flat rows, but if a wrapper
  // (`{ items: [...] }`) ever reaches storage it would otherwise render as
  // blank/garbled cells. `normalizeResultRows` unwraps via the shared rule
  // and tells us how many rows it had to recover so we can scream (below).
  const { rows: normalizedResults, unwrappedCount } = useMemo(
    () => normalizeResultRows(results),
    [results],
  );
  useEffect(() => {
    if (unwrappedCount > 0) {
      console.error(
        `[page-extraction] ResultsTable recovered ${unwrappedCount} wrapped ` +
          `result payload(s) client-side. The backend should normalize these ` +
          `before persisting — see coerceToRowList / _coerce_to_row_list.`,
      );
    }
  }, [unwrappedCount]);

  // Rows a validation pass soft-flagged as duplicates carry
  // payload.is_duplicate === true + canonical_entry pointing at the row
  // they duplicate. Soft-flag only — rows are never deleted.
  const dupeCount = useMemo(
    () =>
      normalizedResults.filter(
        (r) => (r.payload as Record<string, unknown> | null)?.is_duplicate,
      ).length,
    [normalizedResults],
  );
  // Merge view (default): absorb each duplicate into its canonical row,
  // back-filling missing fields, and show a "+N merged" badge. Toggle off
  // to see every raw row including the duplicates.
  const merged = useMemo(
    () => buildMergedDuplicateView(normalizedResults),
    [normalizedResults],
  );
  const visibleResults = hideDuplicates ? merged.rows : normalizedResults;
  const mergedCountById = hideDuplicates
    ? merged.mergedCountById
    : EMPTY_MERGED_COUNTS;

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

  /**
   * Template column schema (the durable table definition). When present
   * it is the source of truth: ordered, labeled, source-aware columns —
   * including manual/validation columns that have no data yet. When
   * absent, fall back to inferring columns from the result payload keys.
   */
  const templateCols = useMemo<ExtractionColumn[] | null>(
    () => parseTemplateColumns(job?.output_schema),
    [job?.output_schema],
  );

  const inferredCols = useMemo(
    () => inferColumnsFromRows(normalizedResults),
    [normalizedResults],
  );

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
    visibleResults.length + " row" + (visibleResults.length === 1 ? "" : "s");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/40">
        <span className="text-[10px] text-muted-foreground">
          {rowCountLabel}
          {pageNumber != null ? " (filtered to page " + pageNumber + ")" : ""}
        </span>
        <div className="flex items-center gap-1">
          {dupeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] text-muted-foreground"
              onClick={() => setHideDuplicates((v) => !v)}
              title="Rows a validation pass flagged as duplicates"
            >
              {hideDuplicates
                ? `Show ${dupeCount} duplicate${dupeCount === 1 ? "" : "s"}`
                : "Merge duplicates"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
            disabled={loading}
            onClick={() => refetch()}
            title="Refresh results"
          >
            <RefreshCw
              className={cn("w-3 h-3 mr-1", loading && "animate-spin")}
            />
            Refresh
          </Button>
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
      </div>
      {unwrappedCount > 0 && <RecoveryBanner count={unwrappedCount} />}
      <div className="flex-1 min-h-0 overflow-auto">
        {templateCols ? (
          <SchemaResultsBody
            columns={templateCols}
            results={visibleResults}
            mergedCountById={mergedCountById}
            onJumpToPage={onJumpToPage}
            onRefetch={refetch}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-xs">Page</TableHead>
                {inferredCols.map((key) => (
                  <TableHead key={key} className="text-xs">
                    {prettifyKey(key)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleResults.map((r) => {
                const payload = (r.payload ?? {}) as Record<string, unknown>;
                const canJump =
                  typeof r.canonical_page === "number" && r.canonical_page > 0;
                return (
                  <TableRow
                    key={r.id}
                    className={
                      canJump ? "cursor-pointer hover:bg-muted/50" : ""
                    }
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
                    {inferredCols.map((key) => (
                      <TableCell key={key} className="text-xs align-top">
                        {renderCell(payload[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ─── Schema-driven body (template column schema present) ─────────────────

function SchemaResultsBody({
  columns,
  results,
  mergedCountById,
  onJumpToPage,
  onRefetch,
}: {
  columns: ExtractionColumn[];
  results: PageExtractionResult[];
  mergedCountById: Map<string, number>;
  onJumpToPage?: (page: number) => void;
  onRefetch: () => void;
}) {
  const toast = useToastManager("page-extraction");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-xs">Page</TableHead>
          {columns.map((col) => (
            <TableHead key={col.key} className="text-xs">
              <span className="flex items-center gap-1">
                {col.label}
                {col.source !== "agent" && (
                  <span
                    className="text-[8px] uppercase tracking-wider text-muted-foreground/60"
                    title={COLUMN_SOURCE_META[col.source].hint}
                  >
                    {col.source}
                  </span>
                )}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => {
          const canJump =
            typeof r.canonical_page === "number" && r.canonical_page > 0;
          return (
            <TableRow key={r.id}>
              <TableCell
                className={
                  "text-xs tabular-nums" +
                  (canJump ? " cursor-pointer hover:underline" : "")
                }
                onClick={() => {
                  if (canJump && onJumpToPage)
                    onJumpToPage(r.canonical_page as number);
                }}
              >
                {r.canonical_page ??
                  formatPageRange(
                    Array.isArray(r.source_pages) ? r.source_pages : [],
                  )}
                {(mergedCountById.get(r.id) ?? 0) > 0 && (
                  <span
                    className="ml-1 px-1 py-px rounded bg-primary/10 text-primary text-[8px] font-medium align-middle"
                    title={`${mergedCountById.get(r.id)} duplicate row(s) merged into this entry`}
                  >
                    +{mergedCountById.get(r.id)} merged
                  </span>
                )}
              </TableCell>
              {columns.map((col) => {
                const editable = COLUMN_SOURCE_META[col.source].editable;
                const value = cellValueFor(r, col);
                return (
                  <TableCell key={col.key} className="text-xs align-top">
                    {editable ? (
                      <ManualCell
                        result={r}
                        column={col}
                        value={value}
                        onSaved={onRefetch}
                        onError={(m) => toast.error(m)}
                      />
                    ) : (
                      renderCell(value)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ManualCell({
  result,
  column,
  value,
  onSaved,
  onError,
}: {
  result: PageExtractionResult;
  column: ExtractionColumn;
  value: unknown;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<string>(
    value == null ? "" : String(value),
  );
  const [saving, setSaving] = useState(false);

  const persist = async (raw: string) => {
    const current = String(value ?? "");
    if (raw === current) return;
    setSaving(true);
    try {
      let parsed: unknown = raw;
      if (column.type === "boolean")
        parsed = raw === "" ? null : /^(true|yes|1|y)$/i.test(raw);
      else if (column.type === "number" || column.type === "integer")
        parsed = raw === "" ? null : Number(raw);
      await updateResultPayloadField({
        resultId: result.id,
        currentPayload: (result.payload ?? {}) as Record<string, unknown>,
        key: column.key,
        value: parsed,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => void persist(e.target.value)}
      disabled={saving}
      placeholder="—"
      className="w-full bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-1 py-0.5 text-xs outline-none"
    />
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
  const { results, loading, error, refetch } =
    useExtractionResultsForFile(fileId);
  const { jobs } = useExtractionJobs(fileId);

  // Refetch when results are deleted out-of-band (e.g. an entire run is
  // deleted) — Realtime doesn't reliably deliver DELETEs.
  const resultsNonce = useAppSelector(selectResultsRefreshNonce);
  useEffect(() => {
    if (resultsNonce > 0) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsNonce]);

  // Same defensive normalization as the single-template view, via the shared
  // rule — so the All view can never silently swallow a wrapped payload.
  const { rows: normalizedResults, unwrappedCount } = useMemo(
    () => normalizeResultRows(results),
    [results],
  );
  useEffect(() => {
    if (unwrappedCount > 0) {
      console.error(
        `[page-extraction] All-extractions table recovered ${unwrappedCount} ` +
          `wrapped result payload(s) client-side. The backend should ` +
          `normalize these before persisting — see coerceToRowList.`,
      );
    }
  }, [unwrappedCount]);

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
  const cols = useMemo(
    () => inferColumnsFromRows(normalizedResults),
    [normalizedResults],
  );

  const filtered = useMemo(() => {
    if (!pageNumber) return normalizedResults;
    return normalizedResults.filter(
      (r) =>
        Array.isArray(r.source_pages) && r.source_pages.includes(pageNumber),
    );
  }, [normalizedResults, pageNumber]);

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
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground/70">
            All extractions
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
            disabled={loading}
            onClick={() => refetch()}
            title="Refresh results"
          >
            <RefreshCw
              className={cn("w-3 h-3 mr-1", loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </div>
      {unwrappedCount > 0 && <RecoveryBanner count={unwrappedCount} />}
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

/**
 * Loud-recovery banner. A wrapped payload reaching the display means the
 * backend (or a different extraction service) failed to normalize before
 * persisting. We recover so the user still sees their data, but we surface it
 * visibly (and log to the console) rather than hiding a real defect.
 */
function RecoveryBanner({ count }: { count: number }) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 border-b border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
      <AlertTriangle className="w-3 h-3 text-amber-500" />
      <span>
        Recovered {count} wrapped result payload{count === 1 ? "" : "s"}{" "}
        client-side — the backend should normalize these before saving.
      </span>
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
