"use client";

/**
 * features/page-extraction/data-review/ExtractionDatasetClient.tsx
 *
 * The full review/management grid for ONE extraction dataset
 * (/knowledge/extractions/[id]). Everything the cramped PDF-Studio Results tab
 * couldn't do: search, sort, column show/hide, pagination, run picker, merged
 * duplicates, inline editing of manual columns, per-row + bulk delete, clear,
 * rename / duplicate / archive, run history (cancel + retry), context tagging,
 * jump-to-source, and export (download / copy / push) — all on the SAME shared
 * column + wrapping rules as the inline tab (features/page-extraction/utils/columns).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpDown,
  Columns3,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Layers,
  Loader2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ChevronLeftTapButton,
  MoreHorizontalTapButton,
} from "@/components/icons/tap-buttons";
import { cn } from "@/lib/utils";

import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  getJob,
  updateJob,
  clearJobResults,
  deleteJob,
} from "@/features/page-extraction/api/jobs";
import {
  listResults,
  updateResultPayloadField,
} from "@/features/page-extraction/api/runs";
import {
  augmentColumnsWithUncovered,
  buildMergedDuplicateView,
  cellValueFor,
  COLUMN_SOURCE_META,
  editKeyFor,
  humanizeKey,
  inferColumnsFromRows,
  normalizeResultRows,
  parseTemplateColumns,
} from "@/features/page-extraction/utils/columns";
import type {
  ColumnSource,
  ExtractionColumn,
  PageExtractionJob,
  PageExtractionResult,
} from "@/features/page-extraction/types";

import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import { useOpenExtractionCellEditor } from "@/features/overlays/openers/extractionCellEditorWindow";
import { ExportMenu } from "./ExportMenu";
import { SendToMenu } from "./SendToMenu";
import { RunsPopover } from "./RunsPopover";
import { ExtractionCellDisplay } from "./ExtractionCellDisplay";
import { deleteResultRows, duplicateJob } from "./data";
import { cellToString } from "./export";
import {
  EXTRACTION_ENTITY_TYPE,
  EXTRACTION_JOB_NAME_MAX_LENGTH,
  EXTRACTIONS_ROUTE,
} from "./constants";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createKnowledgeScope } from "@/features/surfaces/manifests/knowledge.manifest";
import {
  MOBILE_TABLE,
} from "@/components/official/mobile-table/mobileTable";

const PAGE_SIZES = [50, 100, 250, 1000] as const;

/**
 * Which column sources each cell write target may touch. The split is the
 * point: correcting a machine-extracted value overwrites what the extractor
 * claimed the document said, while filling a review field only annotates it —
 * two different acts, so two targets and two different confirmations.
 */
const MACHINE_COLUMN_SOURCES: readonly ColumnSource[] = ["agent", "validation"];
const REVIEW_COLUMN_SOURCES: readonly ColumnSource[] = ["manual"];

export function ExtractionDatasetClient({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [job, setJob] = useState<PageExtractionJob | null>(null);
  const [results, setResults] = useState<PageExtractionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [merge, setMerge] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<number>(100);
  const [pageIndex, setPageIndex] = useState(0);

  const openCellEditor = useOpenExtractionCellEditor({
    onSaved: (e) => {
      setResults((rs) =>
        rs.map((r) =>
          r.id === e.target.rowId
            ? {
                ...r,
                payload: { ...r.payload, [e.target.writeKey]: e.value },
              }
            : r,
        ),
      );
    },
  });
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [confirmKind, setConfirmKind] = useState<
    null | "clear" | "archive" | "bulk"
  >(null);
  const [busy, setBusy] = useState(false);

  const loadJob = useCallback(async () => {
    try {
      const j = await getJob(jobId);
      setJob(j);
      if (j) setNameDraft(j.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dataset");
    }
  }, [jobId]);

  const loadResults = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listResults({ jobId, runId: selectedRunId });
      setResults(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load results");
    } finally {
      setLoading(false);
    }
  }, [jobId, selectedRunId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);
  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  // ── Normalize + derive columns (shared rules) ──────────────────────────────
  const { rows: normalizedRows, unwrappedCount } = useMemo(
    () => normalizeResultRows(results),
    [results],
  );

  const { displayRows, mergedCountById } = useMemo(() => {
    if (!merge)
      return {
        displayRows: normalizedRows,
        mergedCountById: new Map<string, number>(),
      };
    const m = buildMergedDuplicateView(normalizedRows);
    return { displayRows: m.rows, mergedCountById: m.mergedCountById };
  }, [normalizedRows, merge]);

  const columns: ExtractionColumn[] = useMemo(() => {
    const tpl = job ? parseTemplateColumns(job.output_schema) : null;
    // Self-heal: even with a declared schema, surface any payload keys it
    // doesn't cover so a stale/mismatched template (e.g. container columns over
    // unwrapped item rows) can never hide the actual data.
    if (tpl && tpl.length > 0)
      return augmentColumnsWithUncovered(tpl, normalizedRows);
    return inferColumnsFromRows(normalizedRows).map((key) => ({
      key,
      label: humanizeKey(key),
      type: "string" as const,
      source: "agent" as const,
      agentField: key,
    }));
  }, [job, normalizedRows]);

  // Apply the dataset's saved column order. Keys present in `column_order`
  // lead in that order; any column not listed (e.g. a freshly added field)
  // keeps its natural position behind them. Empty order = natural order.
  const orderedColumns = useMemo(() => {
    const order = job?.column_order ?? [];
    if (order.length === 0) return columns;
    const pos = new Map(order.map((k, i) => [k, i]));
    return [...columns].sort((a, b) => {
      const ai = pos.has(a.key)
        ? (pos.get(a.key) as number)
        : Number.MAX_SAFE_INTEGER;
      const bi = pos.has(b.key)
        ? (pos.get(b.key) as number)
        : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [columns, job?.column_order]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((c) => !hidden.has(c.key)),
    [orderedColumns, hidden],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const persistColumnOrder = useCallback(
    async (nextKeys: string[]) => {
      if (!job) return;
      const prev = job;
      setJob({ ...job, column_order: nextKeys });
      try {
        await updateJob(job.id, { column_order: nextKeys });
      } catch (e) {
        setJob(prev);
        toast.error("Could not save column order", {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    },
    [job],
  );

  const onColumnDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fullKeys = orderedColumns.map((c) => c.key);
      const from = fullKeys.indexOf(String(active.id));
      const to = fullKeys.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      void persistColumnOrder(arrayMove(fullKeys, from, to));
    },
    [orderedColumns, persistColumnOrder],
  );

  // ── Search + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return displayRows;
    return displayRows.filter((row) =>
      visibleColumns.some((c) =>
        cellToString(cellValueFor(row, c)).toLowerCase().includes(q),
      ),
    );
  }, [displayRows, query, visibleColumns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = cellToString(cellValueFor(a, col));
      const bv = cellToString(cellValueFor(b, col));
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
        return (an - bn) * dir;
      }
      return av.localeCompare(bv) * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const paged = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize],
  );

  useEffect(() => {
    setPageIndex(0);
    setSelected(new Set());
  }, [query, selectedRunId, merge]);

  // ── Export view (all filtered rows, visible columns) ───────────────────────
  const exportColumns = useMemo(
    () =>
      visibleColumns.map((c) => ({ key: c.key, label: c.label, type: c.type })),
    [visibleColumns],
  );
  const exportRows = useMemo(
    () =>
      sorted.map((row) => {
        const out: Record<string, unknown> = {};
        for (const c of visibleColumns) out[c.key] = cellValueFor(row, c);
        return out;
      }),
    [sorted, visibleColumns],
  );

  /**
   * Rows as the SURFACE sees them: the same cells as `exportRows`, PLUS the
   * `row_id` the write targets address — without it an agent can read a wrong
   * value but has no way to name the row it belongs to, and the write half is
   * unusable. Deliberately NOT `exportRows` itself: that array is the user's
   * download / copy / push payload and must stay free of internal ids.
   * `row_id` is assigned last so it wins over a same-named extracted column —
   * addressing the right row matters more than surfacing a field the grid
   * already shows.
   */
  const surfaceRows = useMemo(
    () =>
      sorted.map((row) => {
        const out: Record<string, unknown> = {};
        for (const c of visibleColumns) out[c.key] = cellValueFor(row, c);
        out.row_id = row.id;
        return out;
      }),
    [sorted, visibleColumns],
  );

  // ── Surface scope (matrx-user/knowledge) ───────────────────────────────────
  // Built at TRIGGER time from live state — never on mount. The extraction
  // half of the Knowledge surface; the graph and suggestion halves live on
  // their own routes and emit disjoint values.
  const getSurfaceScope = useCallback(
    () =>
      createKnowledgeScope({
        extraction_job_id: jobId,
        extraction_job_name: job?.name ?? undefined,
        extraction_job_status: job
          ? job.archived_at
            ? "archived"
            : job.is_saved
              ? "saved"
              : "unsaved"
          : undefined,
        extraction_run_id: selectedRunId ?? undefined,
        extraction_job:
          (job as unknown as Record<string, unknown>) ?? undefined,
        extraction_row_count: sorted.length,
        extraction_columns: orderedColumns.map((c) => ({
          key: c.key,
          label: c.label,
          hidden: hidden.has(c.key),
          // The column's SOURCE decides which write target may touch it, so an
          // agent cannot choose correctly without seeing it.
          source: c.source,
          editable: COLUMN_SOURCE_META[c.source]?.editable ?? false,
        })),
        extraction_rows: surfaceRows,
        extraction_selected_row_ids: [...selected],
        extraction_query: query || undefined,
        extraction_sort: sortKey
          ? { key: sortKey, direction: sortDir }
          : undefined,
        extraction_page: { pageIndex, pageSize },
        extraction_merge_duplicates: merge,
      }),
    [
      jobId,
      job,
      selectedRunId,
      sorted,
      orderedColumns,
      hidden,
      surfaceRows,
      selected,
      query,
      sortKey,
      sortDir,
      pageIndex,
      pageSize,
      merge,
    ],
  );

  // ── Surface write handlers (matrx-user/knowledge) ──────────────────────────
  // Every target lands through the SAME function the user's own click lands
  // through: a cell write is `updateResultPayloadField` — the cell editor
  // window's own save — plus the identical local patch its `onSaved` applies;
  // a rename is `updateJob`, exactly as `commitRename` calls it. Bad input
  // THROWS: the writeback seam turns a throw into the error envelope the agent
  // reads, and silently coercing a wrong value is how a "corrected" field
  // becomes a wrong field nobody notices.

  /**
   * Resolve and write ONE cell.
   *
   * `allowedSources` is the enforcement half of the correction/annotation
   * split: which target was called decides which column SOURCES it may touch,
   * and the column's own declared source is what gets checked — never the
   * caller's word for it. That is what keeps the confirmation the user reads
   * honest about which act they are approving.
   */
  const writeCell = useCallback(
    async (
      raw: unknown,
      allowedSources: readonly ColumnSource[],
      what: string,
    ) => {
      if (!job) {
        throw new Error(
          "No extraction dataset is loaded on this page yet — there is nothing to write to.",
        );
      }
      if (results.length === 0) {
        throw new Error(
          "This dataset has no extracted rows, so there is no cell to write.",
        );
      }
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(
          `${what} needs an object like { "row_id": "…", "column_key": "…", "value": "…" }.`,
        );
      }

      const {
        row_id: rowId,
        column_key: columnKey,
        value,
      } = raw as Record<string, unknown>;

      if (typeof rowId !== "string" || rowId.trim() === "") {
        throw new Error(
          `${what} needs a "row_id" string naming the row to write — take it from extraction_rows.`,
        );
      }
      if (typeof columnKey !== "string" || columnKey.trim() === "") {
        throw new Error(
          `${what} needs a "column_key" string naming the column to write — take it from extraction_columns.`,
        );
      }
      if (typeof value !== "string") {
        throw new Error(
          `${what} writes cell text, so "value" must be a string (got ${Array.isArray(value) ? "an array" : typeof value}). Cells are stored as the text the cell editor saves.`,
        );
      }
      if (rowId.includes("#")) {
        throw new Error(
          `Row "${rowId}" is a synthetic sub-row this grid split out of one stored row in the browser — it has no stored row of its own and cannot be written to.`,
        );
      }

      const column = orderedColumns.find((c) => c.key === columnKey);
      if (!column) {
        throw new Error(
          `This dataset has no column "${columnKey}". Its columns are: ${orderedColumns.map((c) => c.key).join(", ") || "(none)"}.`,
        );
      }
      if (!allowedSources.includes(column.source)) {
        throw new Error(
          `"${columnKey}" is a ${column.source} column and ${what.toLowerCase()} only writes ${allowedSources.join(" / ")} columns. ${
            column.source === "system"
              ? "The page anchor is provenance and is never writable."
              : column.source === "manual"
                ? "Use extraction_review_field for a human-review column."
                : "Use extraction_field_correction to change a machine-extracted value."
          }`,
        );
      }
      const writeKey = editKeyFor(column);
      if (!writeKey) {
        throw new Error(`Column "${columnKey}" has no writable payload field.`);
      }

      // Resolve the payload from the STORED rows, never from the display rows:
      // with "Merge dupes" on, a display row's payload has been back-filled
      // from its duplicates, and writing that back would silently persist a
      // view artifact as extracted data.
      const stored = results.find((r) => r.id === rowId);
      if (!stored) {
        throw new Error(
          `No row "${rowId}" is loaded in this dataset. Take row_id from extraction_rows.`,
        );
      }

      await updateResultPayloadField({
        resultId: stored.id,
        currentPayload: (stored.payload ?? {}) as Record<string, unknown>,
        key: writeKey,
        value,
      });
      setResults((rs) =>
        rs.map((r) =>
          r.id === stored.id
            ? { ...r, payload: { ...r.payload, [writeKey]: value } }
            : r,
        ),
      );
    },
    [job, results, orderedColumns],
  );

  const buildWriteHandlers = useCallback(
    () => ({
      extraction_field_correction: (value: unknown) =>
        writeCell(value, MACHINE_COLUMN_SOURCES, "Correct an extracted value"),
      extraction_review_field: (value: unknown) =>
        writeCell(value, REVIEW_COLUMN_SOURCES, "Fill a review field"),
      extraction_dataset_name: async (value: unknown) => {
        if (!job) {
          throw new Error(
            "No extraction dataset is loaded on this page yet — there is nothing to rename.",
          );
        }
        if (typeof value !== "string") {
          throw new Error(
            `The dataset name must be a string (got ${Array.isArray(value) ? "an array" : typeof value}).`,
          );
        }
        const next = value.trim();
        if (next === "") throw new Error("The dataset name cannot be empty.");
        if (next.length > 200) {
          throw new Error(
            `The dataset name is limited to 200 characters (got ${next.length}).`,
          );
        }
        if (next === job.name) return;
        await updateJob(job.id, { name: next });
        setJob({ ...job, name: next });
        // Keep the header's rename input in step, exactly as commitRename ends.
        setNameDraft(next);
      },
    }),
    [job, writeCell],
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleSort = useCallback(
    (key: string) => {
      if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  const commitRename = useCallback(async () => {
    setRenaming(false);
    const next = nameDraft.trim();
    if (!job || !next || next === job.name) return;
    try {
      await updateJob(job.id, { name: next });
      setJob({ ...job, name: next });
      toast.success("Renamed");
    } catch (e) {
      toast.error("Could not rename", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [job, nameDraft]);

  const runConfirmed = useCallback(async () => {
    if (!confirmKind || !job) return;
    setBusy(true);
    try {
      if (confirmKind === "clear") {
        await clearJobResults(job.id);
        toast.success("Data cleared");
        await loadResults();
      } else if (confirmKind === "bulk") {
        await deleteResultRows([...selected].filter((id) => !id.includes("#")));
        toast.success(
          `Deleted ${selected.size} row${selected.size === 1 ? "" : "s"}`,
        );
        setSelected(new Set());
        await loadResults();
      } else if (confirmKind === "archive") {
        await deleteJob(job.id);
        toast.success("Dataset archived");
        startTransition(() => router.push(EXTRACTIONS_ROUTE));
      }
    } catch (e) {
      toast.error("Action failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmKind(null);
    }
  }, [confirmKind, job, selected, loadResults, router]);

  const deleteOneRow = useCallback(async (id: string) => {
    if (id.includes("#")) return;
    try {
      await deleteResultRows([id]);
      setResults((rs) => rs.filter((r) => r.id !== id));
      toast.success("Row deleted");
    } catch (e) {
      toast.error("Could not delete row", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, []);

  const onDuplicate = useCallback(async () => {
    if (!job) return;
    try {
      const newId = await duplicateJob(job.id);
      toast.success("Template duplicated", {
        action: {
          label: "Open",
          onClick: () => router.push(`${EXTRACTIONS_ROUTE}/${newId}`),
        },
      });
    } catch (e) {
      toast.error("Could not duplicate", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [job, router]);

  const jumpToSource = useCallback(() => {
    if (!job?.processed_document_id) return;
    startTransition(() =>
      router.push(`/tools/pdf-extractor/${job.processed_document_id}`),
    );
  }, [job, router]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allPageSelected =
    paged.length > 0 && paged.every((r) => selected.has(r.id));
  const togglePageSelection = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) paged.forEach((r) => next.delete(r.id));
      else paged.forEach((r) => next.add(r.id));
      return next;
    });
  }, [allPageSelected, paged]);

  // ── Surface write targets (matrx-user/knowledge) ───────────────────────────
  // The EXTRACTION mount's three. `extraction_dataset_name` is `mode:"entity"`
  // and goes through the same `updateJob` service the inline rename commits
  // through — it persists, which is why the manifest keeps it on `ask`. The
  // other two are `mode:"ui"` and set exactly the state the toolbar's own
  // search box and column headers set.
  //
  // All three refuse while the dataset is still loading (the grid is a
  // skeleton then, so the write would land invisibly), and the rename also
  // refuses while a destructive confirm (clear data / bulk delete / archive)
  // is running. Deliberately NOT writable: the row selection (its only
  // consumer is the bulk-DELETE confirm), clear / archive / delete, paging,
  // merge-duplicates, and column order — see the manifest's writeTargets.
  const getWriteHandlers = useCallback(
    () => ({
      ...buildWriteHandlers(),
      extraction_dataset_name: async (value: unknown) => {
        if (typeof value !== "string" || !value.trim())
          throw new Error(
            "extraction_dataset_name expects a non-empty string — the dataset's new name.",
          );
        const next = value.trim();
        if (next.length > EXTRACTION_JOB_NAME_MAX_LENGTH)
          throw new Error(
            `extraction_dataset_name expects at most ${EXTRACTION_JOB_NAME_MAX_LENGTH} characters (got ${next.length}).`,
          );
        if (!job)
          throw new Error(
            "extraction_dataset_name is unavailable: the dataset has not loaded yet.",
          );
        if (busy)
          throw new Error(
            "extraction_dataset_name is unavailable right now: a clear / delete / archive action is running on this dataset.",
          );
        await updateJob(job.id, { name: next });
        setJob({ ...job, name: next });
        setNameDraft(next);
      },
      extraction_query: (value: unknown) => {
        if (typeof value !== "string")
          throw new Error(
            'extraction_query expects a string — the text to filter rows by, or "" to clear the filter.',
          );
        if (loading)
          throw new Error(
            "extraction_query is unavailable: the dataset's rows are still loading.",
          );
        setQuery(value);
      },
      extraction_sort: (value: unknown) => {
        if (value === null) {
          setSortKey(null);
          setSortDir("asc");
          return;
        }
        if (loading)
          throw new Error(
            "extraction_sort is unavailable: the dataset's rows are still loading.",
          );
        if (typeof value !== "object" || Array.isArray(value))
          throw new Error(
            'extraction_sort expects `{ "key": "<column key>", "direction": "asc" | "desc" }`, or null to clear the sort.',
          );
        const { key, direction } = value as {
          key?: unknown;
          direction?: unknown;
        };
        // Validate against the columns the grid actually renders — the same
        // list `extraction_columns` publishes — never a re-typed set.
        const columnKeys = orderedColumns.map((c) => c.key);
        if (typeof key !== "string" || !columnKeys.includes(key))
          throw new Error(
            columnKeys.length > 0
              ? `extraction_sort.key expects one of this dataset's columns: ${columnKeys.join(" | ")}.`
              : "extraction_sort is unavailable: this dataset has no columns to sort by.",
          );
        if (direction !== "asc" && direction !== "desc")
          throw new Error(
            'extraction_sort.direction expects "asc" or "desc".',
          );
        setSortKey(key);
        setSortDir(direction);
      },
    }),
    [buildWriteHandlers, job, busy, loading, orderedColumns],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/knowledge"
      getScope={getSurfaceScope}
      getWriteHandlers={getWriteHandlers}
      isEditable={false}
    >
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
          <ChevronLeftTapButton
            href={EXTRACTIONS_ROUTE}
            ariaLabel="Back to all extractions"
          />
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5">
            {renaming ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") {
                    setRenaming(false);
                    setNameDraft(job?.name ?? "");
                  }
                }}
                className="h-7 max-w-sm text-sm"
                style={{ fontSize: "16px" }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="group flex min-w-0 items-center gap-1"
                title="Rename"
              >
                <h1 className="truncate text-sm font-medium text-foreground">
                  {job?.name ?? "Loading…"}
                </h1>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </button>
            )}
            {job?.kind === "validation" && (
              <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                validation
              </span>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center">
            {job && (
              <span className="hidden sm:inline-flex">
                <ContextStatusButton
                  subject={{
                    entityType: EXTRACTION_ENTITY_TYPE,
                    entityId: job.id,
                    title: job.name,
                    subtitle: "Extraction dataset",
                    icon: Layers,
                  }}
                  onSaved={(r) => r.ok && toast.success("Context updated")}
                />
              </span>
            )}
            <span className="hidden sm:inline-flex">
              <RunsPopover
                jobId={jobId}
                selectedRunId={selectedRunId}
                onSelectRun={setSelectedRunId}
                onChanged={() => void loadResults()}
                iconOnly
              />
            </span>
            <span className="hidden sm:inline-flex">
              <SendToMenu
                name={job?.name ?? "extraction"}
                columns={exportColumns}
                rows={exportRows}
                disabled={loading}
                iconOnly
              />
            </span>
            <ExportMenu
              name={job?.name ?? "extraction"}
              columns={exportColumns}
              rows={exportRows}
              disabled={loading}
              iconOnly
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <MoreHorizontalTapButton ariaLabel="More actions" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={jumpToSource}
                  disabled={!job?.processed_document_id}
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Open source PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onDuplicate()}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate template
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfirmKind("clear")}
                  disabled={results.length === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Clear all rows
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmKind("archive")}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Archive dataset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </PageHeader>

      <div className="flex h-full w-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        {/* Sub-toolbar — search / columns / merge */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <div className="relative min-w-[180px] flex-1 max-w-sm">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rows…"
              className="h-8 text-base sm:text-sm"
              style={{ fontSize: "16px" }}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">
                  Columns ({visibleColumns.length}/{columns.length})
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-80 w-56 overflow-y-auto"
            >
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!hidden.has(c.key)}
                  onCheckedChange={(on) =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant={merge ? "default" : "outline"}
            size="sm"
            onClick={() => setMerge((v) => !v)}
            title="Merge duplicate rows flagged by a validation pass"
          >
            <Layers className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Merge dupes</span>
          </Button>

          <div className="ml-auto text-xs text-muted-foreground">
            {loading ? "Loading…" : `${sorted.length.toLocaleString()} rows`}
          </div>
        </div>

        {/* Recovery banner — loud if a wrapped payload reached the client */}
        {unwrappedCount > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {unwrappedCount} stored row
              {unwrappedCount === 1 ? " was" : "s were"} still wrapped and had
              to be unwrapped in the browser. The backend should store flat rows
              — please report this dataset.
            </span>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-accent/40 px-3 py-1.5 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-destructive"
              onClick={() => setConfirmKind("bulk")}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => setSelected(new Set())}
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading rows…
            </div>
          ) : error ? (
            <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
              <Eye className="h-8 w-8 opacity-50" />
              <div className="text-sm font-medium">No rows to show</div>
              <div className="text-xs">
                {results.length === 0
                  ? "This dataset has no extracted rows yet."
                  : "No rows match your search."}
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onColumnDragEnd}
            >
              <table className={cn("border-collapse text-sm", MOBILE_TABLE)}>
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="w-8 px-2 py-2">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={togglePageSelection}
                        aria-label="Select page"
                      />
                    </th>
                    <th className="w-14 px-2 py-2 font-medium">Page</th>
                    <SortableContext
                      items={visibleColumns.map((c) => c.key)}
                      strategy={horizontalListSortingStrategy}
                    >
                      {visibleColumns.map((c) => (
                        <SortableHeaderCell
                          key={c.key}
                          column={c}
                          active={sortKey === c.key}
                          onToggleSort={toggleSort}
                        />
                      ))}
                    </SortableContext>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const mergedCount = mergedCountById.get(row.id) ?? 0;
                    const isSel = selected.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "group border-t border-border/50 hover:bg-accent/30",
                          isSel && "bg-primary/5",
                        )}
                      >
                        <td className="px-2 py-1.5 align-top">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={(on) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (on) next.add(row.id);
                                else next.delete(row.id);
                                return next;
                              })
                            }
                            aria-label="Select row"
                          />
                        </td>
                        <td className="px-2 py-1.5 align-top text-xs text-muted-foreground tabular-nums">
                          {row.canonical_page ??
                            ((row.source_pages ?? []).join(",") || "—")}
                        </td>
                        {visibleColumns.map((c) => {
                          const editable =
                            COLUMN_SOURCE_META[c.source]?.editable;
                          const value = cellToString(cellValueFor(row, c));
                          const writeKey = editKeyFor(c);
                          const pageLabel =
                            row.canonical_page != null
                              ? String(row.canonical_page)
                              : (row.source_pages ?? []).join(",") || "—";
                          const openEditor = () => {
                            if (
                              !editable ||
                              row.id.includes("#") ||
                              !writeKey
                            ) {
                              return;
                            }
                            openCellEditor({
                              rowId: row.id,
                              columnKey: c.key,
                              columnLabel: c.label,
                              pageLabel,
                              value,
                              writeKey,
                              currentPayload: (row.payload ?? {}) as Record<
                                string,
                                unknown
                              >,
                            });
                          };
                          return (
                            <td
                              key={c.key}
                              className={cn(
                                "max-w-[360px] px-3 py-1.5 align-top",
                                editable &&
                                  !row.id.includes("#") &&
                                  "cursor-text hover:bg-primary/5",
                              )}
                              title={
                                editable && !row.id.includes("#")
                                  ? "Double-click to edit"
                                  : undefined
                              }
                              onDoubleClick={openEditor}
                            >
                              <div className="flex items-start gap-1">
                                <span className="min-w-0 flex-1">
                                  <ExtractionCellDisplay value={value} />
                                  {c.key === visibleColumns[0]?.key &&
                                    mergedCount > 0 && (
                                      <span className="ml-1.5 rounded bg-secondary/15 px-1 py-0.5 text-[10px] font-medium text-secondary">
                                        +{mergedCount} merged
                                      </span>
                                    )}
                                </span>
                                {editable && !row.id.includes("#") && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditor();
                                    }}
                                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-60"
                                    title="Edit cell"
                                    aria-label="Edit cell"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-1 py-1.5 align-top">
                          {!row.id.includes("#") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              title="Delete row"
                              onClick={() => void deleteOneRow(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DndContext>
          )}
        </div>

        {/* Pagination footer */}
        {!loading && sorted.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded border border-border bg-background px-1.5 py-0.5"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span>
                {safePage * pageSize + 1}–
                {Math.min((safePage + 1) * pageSize, sorted.length)} of{" "}
                {sorted.length.toLocaleString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={safePage === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={safePage >= pageCount - 1}
                onClick={() =>
                  setPageIndex((p) => Math.min(pageCount - 1, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmKind !== null}
          onOpenChange={(o) => {
            if (!o && !busy) setConfirmKind(null);
          }}
          title={
            confirmKind === "clear"
              ? "Clear all rows?"
              : confirmKind === "bulk"
                ? `Delete ${selected.size} row${selected.size === 1 ? "" : "s"}?`
                : "Archive dataset?"
          }
          description={
            confirmKind === "clear"
              ? "Every extracted row for this dataset will be permanently deleted. The template is kept."
              : confirmKind === "bulk"
                ? "The selected rows will be permanently deleted."
                : "The dataset is hidden from listings. Its rows stay queryable and it can be restored by an admin."
          }
          confirmLabel={confirmKind === "archive" ? "Archive" : "Delete"}
          variant="destructive"
          busy={busy}
          onConfirm={runConfirmed}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

/**
 * A draggable, sortable column header. The grip handle starts a reorder
 * drag; clicking the label still toggles the sort (a pure click never moves
 * far enough to trip the drag's 5px activation distance).
 */
function SortableHeaderCell({
  column,
  active,
  onToggleSort,
}: {
  column: ExtractionColumn;
  active: boolean;
  onToggleSort: (key: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  return (
    <th
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "select-none whitespace-nowrap px-3 py-2 font-medium",
        isDragging ? "z-20 bg-muted opacity-90" : "",
        active && "text-foreground",
      )}
      title={COLUMN_SOURCE_META[column.source]?.hint}
    >
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder ${column.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onToggleSort(column.key)}
          className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
        >
          {column.label}
          {COLUMN_SOURCE_META[column.source]?.editable && (
            <Pencil className="h-2.5 w-2.5 opacity-40" />
          )}
          <ArrowUpDown
            className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")}
          />
        </button>
      </span>
    </th>
  );
}
