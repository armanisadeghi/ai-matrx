"use client";

/**
 * features/page-extraction/data-review/ExtractionCatalogClient.tsx
 *
 * The cross-document catalog at /knowledge/extractions — the "savior" list
 * page for extraction data. Every dataset the user owns, regardless of which
 * PDF it came from: searchable, sortable, context-filterable, with a live
 * context-status nudge per row. Clicking a row opens the full grid.
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
  FileText,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  LoadingTapButton,
  PlusTapButton,
  RefreshCwTapButton,
} from "@ai-matrx/tap-target/buttons";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  ContextAssignmentField,
  type ContextSelection,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";
import {
  fetchEntityScopesBulk,
  primeEntityScopes,
  setRowScopes,
} from "@/features/scopes/components/context-assignment/data";

import { listExtractionCatalog, type ExtractionCatalogEntry } from "./data";
import { CatalogRowActions } from "./CatalogRowActions";
import { EXTRACTION_ENTITY_TYPE } from "./constants";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

type SortKey = "updated" | "name" | "rows" | "source";

const STATUS_STYLES: Record<string, string> = {
  completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  queued:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function ExtractionCatalogClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState<ExtractionCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showFilter, setShowFilter] = useState(false);
  const [filterScopeIds, setFilterScopeIds] = useState<string[]>([]);
  const [scopesByJob, setScopesByJob] = useState<Record<string, string[]>>({});
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExtractionCatalog();
      setEntries(data);
      setError(null);
      const ids = data.map((d) => d.jobId);
      primeEntityScopes(EXTRACTION_ENTITY_TYPE, ids);
      const byEntity = await fetchEntityScopesBulk(EXTRACTION_ENTITY_TYPE, ids);
      setScopesByJob(byEntity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load extractions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "name" || key === "source" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = entries;
    if (q) {
      rows = rows.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.sourceName.toLowerCase().includes(q),
      );
    }
    if (filterScopeIds.length > 0) {
      const need = new Set(filterScopeIds);
      rows = rows.filter((e) => {
        const tags = scopesByJob[e.jobId] ?? [];
        return tags.some((t) => need.has(t));
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "source":
          return a.sourceName.localeCompare(b.sourceName) * dir;
        case "rows":
          return (a.rowCount - b.rowCount) * dir;
        case "updated":
        default:
          return (
            (new Date(a.updatedAt).getTime() -
              new Date(b.updatedAt).getTime()) *
            dir
          );
      }
    });
  }, [entries, query, filterScopeIds, scopesByJob, sortKey, sortDir]);

  const onFilterChange = useCallback((sel: ContextSelection) => {
    setFilterScopeIds(sel.scopeIds);
  }, []);

  const open = useCallback(
    (jobId: string) => {
      setNavigatingId(jobId);
      startTransition(() => router.push(`/knowledge/extractions/${jobId}`));
    },
    [router],
  );

  const tableColumns: MatrxColumnDef<ExtractionCatalogEntry>[] = [
    { id: "name", header: "Dataset", accessorKey: "name", cell: (row) => <div className="flex items-center gap-2"><Table2 className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 font-medium">{row.name}</span>{row.kind === "validation" ? <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">validation</span> : null}</div> },
    { id: "source", header: "Source", accessorKey: "sourceName", cell: (row) => <div className="flex items-center gap-1.5 text-muted-foreground"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[220px]">{row.sourceName}</span></div> },
    { id: "rows", header: "Rows", accessorKey: "rowCount", align: "right", cell: (row) => <span className="tabular-nums">{row.rowCount.toLocaleString()}</span> },
    { id: "status", header: "Status", accessorFn: (row) => row.latestRunStatus ?? "", cell: (row) => row.latestRunStatus ? <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLES[row.latestRunStatus] ?? STATUS_STYLES.cancelled)}>{row.latestRunStatus}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { id: "updated", header: "Updated", accessorKey: "updatedAt", cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatRelativeTime(row.updatedAt)}</span> },
    { id: "context", header: "Context", filter: false, sortable: false, align: "center", cell: (row) => <ContextStatusButton knownScopeCount={(scopesByJob[row.jobId] ?? []).length} subject={{ entityType: EXTRACTION_ENTITY_TYPE, entityId: row.jobId, title: row.name, subtitle: row.sourceName, icon: Table2 }} onSaved={(result) => { if (result.ok) { setRowScopes(EXTRACTION_ENTITY_TYPE, row.jobId, result.selection.scopeIds); setScopesByJob((previous) => ({ ...previous, [row.jobId]: result.selection.scopeIds })); toast.success("Context updated"); } }} /> },
  ];

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
          <h1 className="text-sm font-medium text-foreground truncate">
            Extraction Data
          </h1>
          <div className="ml-auto shrink-0 flex items-center">
            {loading ? (
              <LoadingTapButton ariaLabel="Refreshing" disabled />
            ) : (
              <RefreshCwTapButton
                ariaLabel="Refresh"
                onClick={() => void load()}
              />
            )}
            <PlusTapButton
              variant="solid"
              ariaLabel="New extraction"
              onClick={() =>
                startTransition(() => router.push("/tools/pdf-extractor"))
              }
              disabled={isPending}
            />
          </div>
        </div>
      </PageHeader>

      <div className="w-full h-full flex flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        {/* Sub-toolbar — search / context filter (below shell header) */}
        <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search datasets and sources…"
                className="h-9 pl-8 text-base sm:text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
            <Button
              variant={
                showFilter || filterScopeIds.length > 0 ? "default" : "outline"
              }
              size="sm"
              onClick={() => setShowFilter((v) => !v)}
              title="Filter by context"
            >
              <Filter className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                Context
                {filterScopeIds.length > 0 ? ` (${filterScopeIds.length})` : ""}
              </span>
            </Button>
          </div>
          {showFilter && (
            <div className="rounded-md border border-border bg-card p-2">
              <ContextAssignmentField
                mode="filter"
                writeMode="preview"
                sectionHeight={220}
                onSelectionChange={onFilterChange}
              />
            </div>
          )}
        </div>

        {/* Body — vertical scroll only; the <table> itself is the horizontal
            scroller below `sm` (global mobile CSS gives `table` its own
            `overflow-x: auto`). A second overflow-x-auto ancestor here would
            let a real scroll gesture target the WRONG container and drag the
            sticky-frozen first column out of view along with everything
            else — see MatrxDataTable.tsx for the same one-scroller rule. */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
              datasets…
            </div>
          ) : error ? (
            <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState hasAny={entries.length > 0} />
          ) : (
            <NonEditableContextMenu
              sourceFeature="page_extraction"
              surfaceName="matrx-user/knowledge"
              contentSource={{ type: "raw" }}
              contextData={{
                content: `Extraction datasets (${visible.length}):\n${visible
                  .map((e) => `- ${e.name} — source ${e.sourceName}, ${e.rowCount.toLocaleString()} rows, ${e.latestRunStatus ?? "no runs"}`)
                  .join("\n")}`,
              }}
              resolveContextOnOpen={(target) => {
                const id = target
                  ?.closest("[data-row-id]")
                  ?.getAttribute("data-row-id");
                const row = id ? visible.find((e) => e.jobId === id) : undefined;
                if (!row) return null;
                return {
                  content: `Dataset: ${row.name}\nSource: ${row.sourceName}\nRows: ${row.rowCount.toLocaleString()}\nStatus: ${row.latestRunStatus ?? "—"}\nUpdated: ${row.updatedAt}`,
                  [CONTEXT_MENU_ENTITY_KEY]: {
                    type: EXTRACTION_ENTITY_TYPE,
                    id: row.jobId,
                    title: row.name,
                  },
                };
              }}
            >
            <MatrxDataTable data={visible} columns={tableColumns} getRowId={(row) => row.jobId} pageSize={0} hidePagination hideToolbar onRowOpen={(row) => open(row.jobId)} rowActions={(row) => <CatalogRowActions jobId={row.jobId} rowCount={row.rowCount} />} />
            </NonEditableContextMenu>
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
      <ShieldCheck className="h-8 w-8 opacity-50" />
      <div className="text-sm font-medium">
        {hasAny ? "No datasets match your filters" : "No extraction data yet"}
      </div>
      <div className="max-w-sm text-xs">
        {hasAny
          ? "Try clearing the search or context filter."
          : "Run an extraction from the PDF Extractor and your structured results will collect here, ready to review, export, and organize."}
      </div>
    </div>
  );
}
