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
  ArrowLeft,
  ArrowUpDown,
  Columns3,
  Copy,
  ExternalLink,
  Eye,
  GripVertical,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";

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
  ExtractionColumn,
  PageExtractionJob,
  PageExtractionResult,
} from "@/features/page-extraction/types";

import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import { ExportMenu } from "./ExportMenu";
import { SendToMenu } from "./SendToMenu";
import { RunsPopover } from "./RunsPopover";
import { deleteResultRows, duplicateJob } from "./data";
import { cellToString } from "./export";
import { EXTRACTION_ENTITY_TYPE, EXTRACTIONS_ROUTE } from "./constants";

const PAGE_SIZES = [50, 100, 250, 1000] as const;

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

  const [editing, setEditing] = useState<{ rowId: string; key: string } | null>(
    null,
  );
  const [editDraft, setEditDraft] = useState("");
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
    if (tpl && tpl.length > 0) return tpl;
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

  const commitEdit = useCallback(async () => {
    if (!editing) return;
    const row = displayRows.find((r) => r.id === editing.rowId);
    const col = columns.find((c) => c.key === editing.key);
    setEditing(null);
    if (!row || !col || editing.rowId.includes("#")) return;
    const writeKey = editKeyFor(col);
    if (!writeKey) return;
    const prev = cellToString(cellValueFor(row, col));
    if (prev === editDraft) return;
    try {
      await updateResultPayloadField({
        resultId: row.id,
        currentPayload: row.payload,
        key: writeKey,
        value: editDraft,
      });
      setResults((rs) =>
        rs.map((r) =>
          r.id === row.id
            ? { ...r, payload: { ...r.payload, [writeKey]: editDraft } }
            : r,
        ),
      );
      toast.success("Saved");
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [editing, editDraft, displayRows, columns]);

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-page w-full flex-col overflow-hidden bg-textured">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => startTransition(() => router.push(EXTRACTIONS_ROUTE))}
          title="Back to all extractions"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
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
              className="h-8 max-w-sm text-base sm:text-sm"
              style={{ fontSize: "16px" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="group flex min-w-0 items-center gap-1.5"
              title="Rename"
            >
              <span className="truncate text-base font-semibold">
                {job?.name ?? "Loading…"}
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </button>
          )}
          {job?.kind === "validation" && (
            <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
              validation
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {job && (
            <ContextStatusButton
              size="sm"
              showScopeLabel
              subject={{
                entityType: EXTRACTION_ENTITY_TYPE,
                entityId: job.id,
                title: job.name,
                subtitle: "Extraction dataset",
                icon: Layers,
              }}
              onSaved={(r) => r.ok && toast.success("Context updated")}
            />
          )}
          <RunsPopover
            jobId={jobId}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
            onChanged={() => void loadResults()}
          />
          <SendToMenu
            name={job?.name ?? "extraction"}
            columns={exportColumns}
            rows={exportRows}
            disabled={loading}
          />
          <ExportMenu
            name={job?.name ?? "extraction"}
            columns={exportColumns}
            rows={exportRows}
            disabled={loading}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
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

      {/* Toolbar */}
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
            {unwrappedCount === 1 ? " was" : "s were"} still wrapped and had to
            be unwrapped in the browser. The backend should store flat rows —
            please report this dataset.
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
          <table className="w-full border-collapse text-sm">
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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onColumnDragEnd}
                >
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
                </DndContext>
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
                      const editable = COLUMN_SOURCE_META[c.source]?.editable;
                      const isEditing =
                        editing?.rowId === row.id && editing?.key === c.key;
                      const value = cellToString(cellValueFor(row, c));
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
                          onDoubleClick={() => {
                            if (editable && !row.id.includes("#")) {
                              setEditing({ rowId: row.id, key: c.key });
                              setEditDraft(value);
                            }
                          }}
                        >
                          {isEditing ? (
                            <Input
                              autoFocus
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onBlur={() => void commitEdit()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitEdit();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="h-7 text-base sm:text-sm"
                              style={{ fontSize: "16px" }}
                            />
                          ) : (
                            <div className="flex items-start gap-1 whitespace-pre-wrap break-words">
                              <span className="min-w-0 flex-1">
                                {value || (
                                  <span className="text-muted-foreground/40">
                                    —
                                  </span>
                                )}
                                {c.key === visibleColumns[0]?.key &&
                                  mergedCount > 0 && (
                                    <span className="ml-1.5 rounded bg-secondary/15 px-1 py-0.5 text-[10px] font-medium text-secondary">
                                      +{mergedCount} merged
                                    </span>
                                  )}
                              </span>
                              {editable && !row.id.includes("#") && (
                                <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
                              )}
                            </div>
                          )}
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
