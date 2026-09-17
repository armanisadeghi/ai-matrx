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
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { FileText, Filter, Loader2, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterScopeIds, setFilterScopeIds] = useState<string[]>([]);
  const [scopesByJob, setScopesByJob] = useState<Record<string, string[]>>({});
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (hasLoadedRef.current) setIsFetching(true);
    else setLoading(true);
    try {
      const data = await listExtractionCatalog();
      setEntries(data);
      hasLoadedRef.current = true;
      setError(null);
      const ids = data.map((d) => d.jobId);
      primeEntityScopes(EXTRACTION_ENTITY_TYPE, ids);
      const byEntity = await fetchEntityScopesBulk(EXTRACTION_ENTITY_TYPE, ids);
      setScopesByJob(byEntity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load extractions");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    // Start after the initial render commits so the loading transition does
    // not synchronously cascade from this effect into the first paint.
    void Promise.resolve().then(load);
  }, [load]);

  const contextFilteredEntries = useMemo(() => {
    if (filterScopeIds.length === 0) return entries;
    const need = new Set(filterScopeIds);
    return entries.filter((e) => {
      const tags = scopesByJob[e.jobId] ?? [];
      return tags.some((t) => need.has(t));
    });
  }, [entries, filterScopeIds, scopesByJob]);

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
    {
      id: "name",
      header: "Dataset",
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-2">
          {isPending && navigatingId === row.jobId ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-label="Opening dataset" /> : <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 font-medium">{row.name}</span>
          {row.kind === "validation" ? (
            <span className="rounded bg-secondary/15 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
              validation
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      accessorKey: "sourceName",
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate max-w-[220px]">{row.sourceName}</span>
        </div>
      ),
    },
    {
      id: "rows",
      header: "Rows",
      accessorKey: "rowCount",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums">{row.rowCount.toLocaleString()}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.latestRunStatus ?? "",
      cell: (row) =>
        row.latestRunStatus ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
              STATUS_STYLES[row.latestRunStatus] ?? STATUS_STYLES.cancelled,
            )}
          >
            {row.latestRunStatus}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "updated",
      header: "Updated",
      accessorKey: "updatedAt",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatRelativeTime(row.updatedAt)}
        </span>
      ),
    },
    {
      id: "context",
      header: "Context",
      filter: false,
      sortable: false,
      align: "center",
      cell: (row) => (
        <ContextStatusButton
          knownScopeCount={(scopesByJob[row.jobId] ?? []).length}
          subject={{
            entityType: EXTRACTION_ENTITY_TYPE,
            entityId: row.jobId,
            title: row.name,
            subtitle: row.sourceName,
            icon: Table2,
          }}
          onSaved={(result) => {
            if (result.ok) {
              setRowScopes(
                EXTRACTION_ENTITY_TYPE,
                row.jobId,
                result.selection.scopeIds,
              );
              setScopesByJob((previous) => ({
                ...previous,
                [row.jobId]: result.selection.scopeIds,
              }));
              toast.success("Context updated");
            }
          }}
        />
      ),
    },
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
        {/* Body — vertical scroll only; the <table> itself is the horizontal
            scroller below `sm` (global mobile CSS gives `table` its own
            `overflow-x: auto`). A second overflow-x-auto ancestor here would
            let a real scroll gesture target the WRONG container and drag the
            sticky-frozen first column out of view along with everything
            else — see MatrxDataTable.tsx for the same one-scroller rule. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {error ? (
            <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <NonEditableContextMenu
              sourceFeature="page_extraction"
              surfaceName="matrx-user/knowledge"
              contentSource={{ type: "raw" }}
              contextData={{
                content: `Extraction datasets (${contextFilteredEntries.length}):\n${contextFilteredEntries
                  .map(
                    (e) =>
                      `- ${e.name} — source ${e.sourceName}, ${e.rowCount.toLocaleString()} rows, ${e.latestRunStatus ?? "no runs"}`,
                  )
                  .join("\n")}`,
              }}
              resolveContextOnOpen={(target) => {
                const id = target
                  ?.closest("[data-row-id]")
                  ?.getAttribute("data-row-id");
                const row = id
                  ? contextFilteredEntries.find((e) => e.jobId === id)
                  : undefined;
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
              <MatrxDataTable<ExtractionCatalogEntry>
                tableId="knowledge-extraction-catalog"
                data={contextFilteredEntries}
                columns={tableColumns}
                getRowId={(row) => row.jobId}
                defaultSort={{ id: "updated", direction: "desc" }}
                isLoading={loading}
                isFetching={isFetching}
                detail={{ enabled: false }}
                onRowOpen={(row) => open(row.jobId)}
                rowActions={(row) => (
                  <CatalogRowActions
                    jobId={row.jobId}
                    rowCount={row.rowCount}
                  />
                )}
                toolbar={{
                  search: true,
                  searchPlaceholder: "Search datasets and sources…",
                  refresh: { onRefresh: load },
                  add: {
                    onAdd: () =>
                      startTransition(() =>
                        router.push("/tools/pdf-extractor"),
                      ),
                    disabled: isPending,
                  },
                  facets: [
                    {
                      type: "custom",
                      id: "context-filter",
                      filter: {
                        active: filterScopeIds.length > 0,
                        onReset: () => {
                          setFilterScopeIds([]);
                          setShowFilter(false);
                        },
                      },
                      render: () => (
                        <Button
                          variant={
                            showFilter || filterScopeIds.length > 0
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => setShowFilter((value) => !value)}
                          title="Filter by context"
                        >
                          <Filter className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">
                            Context
                            {filterScopeIds.length > 0
                              ? ` (${filterScopeIds.length})`
                              : ""}
                          </span>
                        </Button>
                      ),
                    },
                  ],
                  leading: showFilter ? (
                    <div className="rounded-md border border-border bg-card p-2">
                      <ContextAssignmentField
                        initialSelection={{ scopeIds: filterScopeIds }}
                        mode="filter"
                        writeMode="preview"
                        sectionHeight={220}
                        onSelectionChange={onFilterChange}
                      />
                    </div>
                  ) : undefined,
                }}
                emptyState={{
                  title:
                    entries.length > 0
                      ? "No datasets match your filters"
                      : "No extraction data yet",
                  description:
                    entries.length > 0
                      ? "Try clearing the search or context filter."
                      : "Run an extraction from the PDF Extractor and your structured results will collect here, ready to review, export, and organize.",
                }}
              />
            </NonEditableContextMenu>
          )}
        </div>
      </div>
    </>
  );
}
