"use client";

// features/crm/components/deals/DealsPage.tsx
//
// /crm/deals — the deals surface: a dense server-paginated LIST (MatrxDataTable,
// saved-view capable) and a kanban BOARD (drag-to-stage), one toggle apart.
// QUERY lives in useDealList and starts clean; STYLE persists via
// useListViewPrefs("crm-deals"). Smart views ride the same `crm.saved_view`
// table as the party list, discriminated by `list_key='deals'`.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Columns3,
  Handshake,
  List,
  MoreVertical,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { dealMenuTarget, useCrmRowMenu } from "../crm-row-actions";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { cn } from "@/lib/utils";
import { SavedViewBar } from "../saved-views/SavedViewBar";
import { useDealList } from "../../deals/useDealList";
import { usePipelines } from "../../deals/usePipelines";
import { useOrgMembers } from "../../deals/useOrgMembers";
import {
  deleteDeal,
  fetchBoardDeals,
  moveDealToStage,
  restoreDeal,
} from "../../deals/service";
import type {
  DealDateBucket,
  DealListFilters,
  DealListRow,
  DealStatusFilter,
  DealSortDirection,
} from "../../deals/types";
import {
  DEAL_DATE_BUCKET_VALUES,
  DEAL_STATUS_FILTERS,
  DEAL_STATUS_FILTER_LABEL,
} from "../../deals/types";
import {
  DEAL_VIEW_CODEC,
  dealDefinitionFromQuery,
  dealDefinitionsMatch,
  dealQueryFromDefinition,
  describeDealDefinition,
} from "../../deals/views";
import type { DealViewDefinition } from "../../deals/views";
import { buildDealColumns } from "./columns";
import { DealCreateDialog } from "./DealCreateDialog";
import { DealsBoard } from "./DealsBoard";

const SURFACE_KEY = "crm-deals";
const SURFACE_DEFAULTS = {
  version: 1,
  sort: "updated_at",
  direction: "desc" as const,
};

/** Table `columnFilters` → the service's typed filter bag. */
function fromTableFilters(state: ColumnFiltersState): DealListFilters {
  const out: DealListFilters = {};
  for (const [id, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text" && f.value?.trim() && id === "name") {
      out.name = f.value.trim();
    } else if (f.kind === "select") {
      const values = f.values?.length ? f.values : f.value ? [f.value] : [];
      if (values.length === 0) continue;
      if (id === "stage_id") out.stage_id = values;
      else if (
        id === "expected_close_date" ||
        id === "updated_at" ||
        id === "created_at"
      ) {
        const bucket = values.find((v) =>
          (DEAL_DATE_BUCKET_VALUES as readonly string[]).includes(v),
        );
        if (bucket) out[id] = bucket as DealDateBucket;
      }
    }
  }
  return out;
}

/** The service bag → the table's controlled `columnFilters` shape. */
function toTableFilters(filters: DealListFilters): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  if (filters.name) out.name = { kind: "text", value: filters.name };
  if (filters.stage_id?.length)
    out.stage_id = {
      kind: "select",
      value: filters.stage_id[0],
      values: filters.stage_id,
    };
  if (filters.expected_close_date)
    out.expected_close_date = {
      kind: "select",
      value: filters.expected_close_date,
    };
  if (filters.updated_at)
    out.updated_at = { kind: "select", value: filters.updated_at };
  if (filters.created_at)
    out.created_at = { kind: "select", value: filters.created_at };
  return out;
}

type BoardState = {
  rows: DealListRow[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

export function DealsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedViewId = searchParams.get("view");
  const requestedMode = searchParams.get("mode");

  const { prefs, setPrefs } = useListViewPrefs(SURFACE_KEY, SURFACE_DEFAULTS);
  const list = useDealList({
    sort: prefs.sort,
    direction: prefs.direction as DealSortDirection,
    pageSize: prefs.pageSize,
  });
  const {
    pipelines,
    stageById,
    pipelineById,
    isLoading: pipelinesLoading,
    error: pipelinesError,
  } = usePipelines();
  const memberOrgIds = useMemo(() => list.ctx?.orgIds ?? [], [list.ctx]);
  const { memberById } = useOrgMembers(memberOrgIds);

  const [mode, setMode] = useState<"board" | "list">(
    requestedMode === "list" ? "list" : "board",
  );
  const [createOpen, setCreateOpen] = useState(false);
  const inTrash = list.query.view === "trash";

  // Board narrows to ONE pipeline; default to the query's, else the first.
  const boardPipelineId = list.query.pipelineId ?? pipelines[0]?.id ?? null;
  const boardPipeline = boardPipelineId
    ? (pipelineById.get(boardPipelineId) ?? null)
    : null;

  // Board data — its own bounded fetch (whole columns, not a page).
  const [board, setBoard] = useState<BoardState>({
    rows: [],
    total: 0,
    isLoading: true,
    error: null,
  });
  const [boardGeneration, setBoardGeneration] = useState(0);
  useEffect(() => {
    if (mode !== "board" || !list.ctx || !boardPipelineId) return;
    const ctx = list.ctx;
    let cancelled = false;
    setBoard((prev) => ({ ...prev, isLoading: true, error: null }));
    void (async () => {
      try {
        const { rows, total } = await fetchBoardDeals(boardPipelineId, ctx);
        if (!cancelled)
          setBoard({ rows, total, isLoading: false, error: null });
      } catch (e) {
        if (!cancelled)
          setBoard((prev) => ({
            ...prev,
            isLoading: false,
            error: e instanceof Error ? e.message : String(e),
          }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, list.ctx, boardPipelineId, boardGeneration]);
  const refreshBoard = () => setBoardGeneration((g) => g + 1);

  // Smart views (list_key = 'deals').
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const applyView = (definition: DealViewDefinition) => {
    list.setQuery(dealQueryFromDefinition(definition));
    setPrefs({ sort: definition.sort, direction: definition.direction });
    setMode("list");
  };

  // The ACTIVE org, not orgIds[0] (D227): the ctx lists every org the user
  // belongs to in arbitrary order, so `orgIds[0]` pointed the create dialog's
  // party search (and the deal itself) at whichever org happened to be first —
  // searching an org the user was not even looking at, returning nothing.
  const activeOrgId = useAppSelector(selectEffectiveOrganizationId);
  const effectiveOrgId =
    (activeOrgId && list.ctx?.orgIds.includes(activeOrgId)
      ? activeOrgId
      : null) ??
    list.ctx?.orgIds[0] ??
    null;

  const onTableState = (state: MatrxDataTableQueryState) => {
    if (
      state.sort &&
      (state.sort.id !== prefs.sort || state.sort.direction !== prefs.direction)
    ) {
      setPrefs({ sort: state.sort.id, direction: state.sort.direction });
    }
    if (state.pageSize !== prefs.pageSize)
      setPrefs({ pageSize: state.pageSize });
    list.setQuery({
      page: state.page,
      search: state.search,
      filters: {
        ...fromTableFilters(state.columnFilters),
        // The status facet is toolbar-owned; carry it through table state.
        status: list.query.filters.status,
      },
    });
  };

  const columns = useMemo(
    () =>
      buildDealColumns({
        stageById,
        pipeline: list.query.pipelineId
          ? (pipelineById.get(list.query.pipelineId) ?? null)
          : pipelines.length === 1
            ? pipelines[0]
            : null,
        memberById,
      }),
    [stageById, pipelineById, pipelines, list.query.pipelineId, memberById],
  );

  const statusFacetValue = list.query.filters.status ?? "open";

  const onDelete = async (row: DealListRow) => {
    const ok = await confirm({
      title: `Delete "${row.name}"?`,
      description: "The deal moves to trash. Its history is kept.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteDeal(row.id);
      list.removeRow(row.id);
      toast.success(`"${row.name}" deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  /**
   * ONE definition of a deal row's verbs, used by BOTH the row's "…" button
   * and the pane's right-click menu (`useCrmRowMenu` converts it). A deal's
   * stage is its authority — the DB derives status/closed_at from the move —
   * so "Move to stage" writes through the same `moveDealToStage` the board's
   * drag uses, never a second path.
   */
  const menuFor =
    (row: DealListRow): (() => ItemMenuConfig) =>
    () => {
      if (inTrash) {
        return {
          sections: [
            {
              id: "main",
              items: [
                {
                  id: "restore",
                  label: "Restore",
                  onSelect: async () => {
                    try {
                      await restoreDeal(row.id);
                      list.removeRow(row.id);
                      toast.success(`"${row.name}" restored`);
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Restore failed",
                      );
                    }
                  },
                },
              ],
            },
          ],
        };
      }
      const stages =
        pipelines.find((p) => p.stages.some((st) => st.id === row.stage_id))
          ?.stages ?? [];
      return {
        sections: [
          {
            id: "main",
            items: [
              {
                id: "open",
                label: "Open",
                onSelect: () => router.push(`/crm/deals/${row.id}`),
              },
              {
                id: "delete",
                label: "Delete",
                tone: "destructive" as const,
                onSelect: () => void onDelete(row),
              },
            ],
          },
          ...(stages.length > 0
            ? [
                {
                  id: "stage",
                  label: "Move to stage",
                  items: stages
                    .filter((stage) => stage.id !== row.stage_id)
                    .map((stage) => ({
                      id: `stage-${stage.id}`,
                      label: stage.name,
                      onSelect: async () => {
                        try {
                          await moveDealToStage({
                            dealId: row.id,
                            stageId: stage.id,
                          });
                          list.refresh();
                          refreshBoard();
                          toast.success(`"${row.name}" → ${stage.name}`);
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Move failed",
                          );
                        }
                      },
                    })),
                },
              ]
            : []),
        ],
      };
    };

  const rowMenu = useCrmRowMenu<DealListRow>({
    rows: () => list.rows,
    toTarget: (row) => dealMenuTarget(row, stageById.get(row.stage_id)?.name),
    rowMenu: menuFor,
  });

  const pipelineFacetOptions = [
    { value: "all", label: "All pipelines" },
    ...pipelines.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div
      className="flex h-full flex-col overflow-y-auto bg-textured px-3 pb-4"
      style={{ paddingTop: "calc(var(--shell-header-h) + 0.5rem)" }}
    >
      {/* Header strip: mode toggle · pipeline picker (board) · trash · new */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("board")}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                mode === "board"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board
            </button>
            <button
              type="button"
              onClick={() => setMode("list")}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium",
                mode === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
          {/* Pipeline narrowing — the board always works one pipeline. */}
          {pipelines.length > 1 && (
            <select
              aria-label="Pipeline"
              className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              value={
                mode === "board"
                  ? (boardPipelineId ?? "")
                  : (list.query.pipelineId ?? "all")
              }
              onChange={(e) => {
                const v = e.target.value;
                list.setQuery({ pipelineId: v === "all" ? null : v });
              }}
            >
              {(mode === "board"
                ? pipelineFacetOptions.filter((o) => o.value !== "all")
                : pipelineFacetOptions
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              list.setQuery({ view: inTrash ? "active" : "trash" })
            }
          >
            {inTrash ? (
              <Undo2 className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {inTrash ? "Back to deals" : "Trash"}
          </Button>
          {!inTrash && (
            <Button
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              New deal
            </Button>
          )}
        </div>
      </div>

      {!inTrash && (
        <SavedViewBar
          ctx={list.ctx}
          codec={DEAL_VIEW_CODEC}
          current={dealDefinitionFromQuery(list.query, {
            sort: prefs.sort,
            direction: prefs.direction as DealSortDirection,
          })}
          matches={dealDefinitionsMatch}
          describe={describeDealDefinition}
          orgId={effectiveOrgId}
          activeViewId={activeViewId}
          onActiveViewIdChange={setActiveViewId}
          onApply={applyView}
          autoOpenViewId={requestedViewId}
          className="mt-2"
        />
      )}

      {(list.error || pipelinesError) && (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {list.error ?? pipelinesError}
        </div>
      )}

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        {mode === "board" && !inTrash ? (
          board.error ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {board.error}
            </div>
          ) : boardPipeline ? (
            <DealsBoard
              pipeline={boardPipeline}
              deals={board.rows}
              total={board.total}
              memberById={memberById}
              onMoved={(dealId, stageId) => {
                setBoard((prev) => ({
                  ...prev,
                  rows: prev.rows.map((r) =>
                    r.id === dealId
                      ? {
                          ...r,
                          stage_id: stageId,
                          stage_entered_at: new Date().toISOString(),
                        }
                      : r,
                  ),
                }));
                // Refetch for derived fields (status, closed_at) + list parity.
                refreshBoard();
                list.refresh();
              }}
              onRevert={refreshBoard}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              {pipelinesLoading || board.isLoading
                ? "Loading the pipeline…"
                : "No pipeline exists yet — the default Sales pipeline is seeded platform-wide, so this usually means categories failed to load."}
            </div>
          )
        ) : (
          // No `surfaceName`: no surface manifest is registered for /crm/deals
          // today (only `matrx-user/crm`, `matrx-user/crm-outreach-lists`, and
          // the record/manager/inbox/chasebox/create-party surfaces exist —
          // see features/surfaces/manifests/). Claiming an unregistered name
          // would light up Agents chrome that resolves nothing; authoring a
          // real deals manifest is surface-authoring work, out of scope here.
          // rowMenu.resolveContextOnOpen (useCrmRowMenu, crm-row-actions.tsx)
          // still returns the reserved CONTEXT_MENU_ENTITY_KEY per clicked
          // row, so Attach To / Share target the exact deal, not the pane.
          <NonEditableContextMenu
            sourceFeature="crm"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={rowMenu.resolveContextOnOpen}
            extraSections={rowMenu.sections}
          >
            <div className="flex h-full min-h-0 flex-col">
              <MatrxDataTable<DealListRow>
                data={list.rows}
                columns={columns}
                getRowId={(row) => row.id}
                isLoading={list.isLoading}
                isFetching={list.isFetching}
                zebra
                pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
                query={{
                  mode: "controlled",
                  totalItems: list.total,
                  state: {
                    page: list.query.page,
                    pageSize: prefs.pageSize,
                    search: list.query.search,
                    anyOf: "",
                    columnFilters: toTableFilters(list.query.filters),
                    sort: {
                      id: prefs.sort,
                      direction: prefs.direction as DealSortDirection,
                    },
                  },
                  onStateChange: onTableState,
                }}
                toolbar={{
                  search: true,
                  searchPlaceholder: "Search deals by name or description…",
                  facets: [
                    {
                      type: "button-group",
                      id: "status",
                      label: "Status",
                      value: statusFacetValue,
                      defaultValue: "open",
                      options: DEAL_STATUS_FILTERS.map((s) => ({
                        value: s,
                        label: DEAL_STATUS_FILTER_LABEL[s],
                      })),
                      onChange: (value) =>
                        list.setQuery({
                          filters: {
                            ...list.query.filters,
                            status: value as DealStatusFilter,
                          },
                        }),
                    },
                  ],
                }}
                detail={{ enabled: false }}
                window={{ enabled: false }}
                onRowOpen={(row) => router.push(`/crm/deals/${row.id}`)}
                rowActions={(row) => (
                  <ItemMenu align="end" config={menuFor(row)}>
                    <button
                      type="button"
                      aria-label={`Actions for ${row.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </ItemMenu>
                )}
                copy={{
                  label: "Deal",
                  listLabel: "Deals",
                  location: "/crm/deals",
                  rowKind: "crm-deal",
                  listKind: "crm-deal-list",
                  humanRow: (row) =>
                    `${row.name} — ${stageById.get(row.stage_id)?.name ?? "unknown stage"}`,
                  showRow: false,
                  showToolbar: false,
                }}
                emptyState={{
                  icon: <Handshake className="h-6 w-6 text-muted-foreground" />,
                  title: inTrash
                    ? "The trash is empty"
                    : list.query.search ||
                        Object.keys(list.query.filters).length > 1
                      ? "No deals match these filters"
                      : "No deals yet",
                  description: inTrash
                    ? undefined
                    : "Create the first one and work it across the board.",
                  action: !inTrash ? (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      New deal
                    </Button>
                  ) : undefined,
                }}
              />
            </div>
          </NonEditableContextMenu>
        )}
      </div>

      <DealCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pipelines={pipelines}
        orgId={effectiveOrgId}
        searchOrgIds={list.ctx?.orgIds}
        userId={list.ctx?.userId ?? null}
        defaultPipelineId={boardPipelineId}
        onCreated={(deal) => {
          list.refresh();
          refreshBoard();
          router.push(`/crm/deals/${deal.id}`);
        }}
      />
    </div>
  );
}
