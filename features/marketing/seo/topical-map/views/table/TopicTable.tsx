"use client";

/**
 * features/marketing/seo/topical-map/views/table/TopicTable.tsx — the map as
 * rows and columns on the platform table (PLAN §6 B, vision §2.1 "Table").
 *
 * ONE STORE, TWO MODES (R10).
 * - Hierarchy: the rows are `selectVisibleMapTopics` in the order it returns —
 *   the store owns expansion, ancestor-keeping search and sibling order. A
 *   header-click sort the walk can honour (name ascending; pages / planned /
 *   keywords descending) becomes `setSiblingSort`; any other sort, and any
 *   column filter, flips the table to FLAT and says so in the toolbar.
 * - Flat: every loaded topic, processed by the canonical local engine
 *   (`filterAndSortRows`), indent off, the ancestor path under each name.
 * The Hierarchy / Flat toggle is always visible and bound to `setTableHierarchy`.
 *
 * Everything the user changes lives in the slice — checked topics, the column
 * set, the mode, the sibling sort, the text filter — so a view switch or a
 * second host (window, canvas) shows the same table. The one thing held here
 * is the flat mode's column filters and sort, which are meaningless in the
 * other mode and are cleared on the way back.
 *
 * Every taste is a knob: `table_default_columns` (the column set until the
 * person changes it), `intent_colors` (the two convergence columns), and the
 * table's own density from `tables.density.mode` through `MatrxDataTableHost`.
 */

import { useRef, useState } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { filterAndSortRows } from "@ai-matrx/design-system/data-table/filter-engine";
import type {
  CellEditsMap,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useOpenTopicPanel } from "@/features/overlays/openers/topicalMapTopicPanel";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { MapViewProps } from "../../components/TopicalMapWorkspaceBody";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../../components/TopicalMapStates";
import { topicalMapErrorText } from "../../errors";
import {
  useMapTopicRows,
  useMapTree,
  useMoveMapTopic,
  usePageIntents,
  usePatchMapTopics,
  useRejectMapTopics,
  useRetireMapTopics,
} from "../../hooks";
import type { TopicalMapKnobs } from "../../knobs";
import { useMapLinks } from "../../links";
import {
  selectMapCheckedSlugs,
  selectMapFilters,
  selectMapLoadedIncludes,
  selectMapSelectedSlug,
  selectMapSiblingSort,
  selectMapTable,
  selectMapTopicsBySlug,
  selectMapWorkspace,
  selectVisibleMapTopics,
} from "../../redux/selectors";
import {
  selectTopic,
  setCheckedTopics,
  setFilters,
  setSiblingSort,
  setTableColumns,
  setTableHierarchy,
  toggleExpanded,
} from "../../redux/slice";
import { buildTopicMenuSection } from "../../ui/topicMenuSection";
import { buildMapTableColumns, type MapTableColumnContext } from "./columns";
import { topicPatchesFromEdits } from "./editPatches";
import { rollupTopicIntents } from "./intentRollup";
import { OpenPagesAction } from "./OpenPagesAction";
import {
  TABLE_COLUMN_IDS,
  TABLE_COLUMN_LABELS,
  classifyHierarchySort,
  flatRows,
  hasActiveColumnFilter,
  hierarchyRows,
  resolveVisibleColumns,
  sortStateForSiblingSort,
  type MapTableRow,
  type TableColumnId,
} from "./tableRows";

/**
 * The same projection the outline asks `map_tree` for, so the query cache is
 * shared across a view switch (the query key is the options object).
 */
const TABLE_TREE_INCLUDE = ["description", "status", "counts", "facets"];

/**
 * `seo.list_page_intents` clamps to 1..1000. One read at the ceiling is what
 * the rollup columns get; when the map lists more pages than that, the header
 * says "partial" and the title carries the numbers. Never a silent subset.
 */
const INTENTS_PAGE_LIMIT = 1000;

const PAGE_SIZE = 100;

function emptyQuery(search = ""): MatrxDataTableQueryState {
  return { page: 1, pageSize: PAGE_SIZE, search, anyOf: "", columnFilters: {}, sort: null };
}

type FlipReason = { kind: "sort"; columnId: string } | { kind: "filter" } | null;

interface PendingRename {
  slug: string;
  name: string;
}

interface PendingRemoval {
  verb: "retire" | "reject";
  row: MapTableRow;
}

export interface TopicTableProps extends MapViewProps {
  knobs: TopicalMapKnobs;
}

export function TopicTable({ mapId, siteId, host, readOnly, knobs }: TopicTableProps) {
  const dispatch = useAppDispatch();
  const links = useMapLinks();
  const openTopicPanel = useOpenTopicPanel();
  const rootRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(rootRef, { label: "The topical map table" });

  // ── Reads ────────────────────────────────────────────────────────────────
  const tree = useMapTree(mapId, {
    include: TABLE_TREE_INCLUDE,
    siteId: siteId ?? undefined,
  });

  const workspace = useAppSelector(selectMapWorkspace(mapId));
  const topicsBySlug = useAppSelector(selectMapTopicsBySlug(mapId));
  const visible = useAppSelector(selectVisibleMapTopics(mapId));
  const tableState = useAppSelector(selectMapTable(mapId));
  const siblingSort = useAppSelector(selectMapSiblingSort(mapId));
  const includes = useAppSelector(selectMapLoadedIncludes(mapId));
  const selectedSlug = useAppSelector(selectMapSelectedSlug(mapId));
  const checkedSlugs = useAppSelector(selectMapCheckedSlugs(mapId));
  const filters = useAppSelector(selectMapFilters(mapId));

  const visibleColumns = resolveVisibleColumns(
    tableState.columns,
    knobs.table_default_columns,
  );
  const wantsIntents = visibleColumns.includes("leaving") || visibleColumns.includes("arriving");
  const wantsUpdated = visibleColumns.includes("updated");

  const intents = usePageIntents(mapId, { siteId, limit: INTENTS_PAGE_LIMIT }, wantsIntents);
  const topicRows = useMapTopicRows(mapId, wantsUpdated);

  // ── Writes ───────────────────────────────────────────────────────────────
  const patchTopics = usePatchMapTopics(mapId);
  const moveTopic = useMoveMapTopic(mapId);
  const retireTopics = useRetireMapTopics(mapId);
  const rejectTopics = useRejectMapTopics(mapId);

  // ── Local state: only what has no meaning in the other mode ──────────────
  const [flatQuery, setFlatQuery] = useState<MatrxDataTableQueryState>(() => emptyQuery());
  const [flipReason, setFlipReason] = useState<FlipReason>(null);
  const [contextRow, setContextRow] = useState<MapTableRow | null>(null);
  const [pendingRename, setPendingRename] = useState<PendingRename | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  if (tree.isPending) return <TopicalMapLoading what="this map's topics" />;
  if (tree.isError) return <TopicalMapFailed what="this map's topics" error={tree.error} />;
  if (intents.isError) {
    return <TopicalMapFailed what="this map's page destinations" error={intents.error} />;
  }
  if (topicRows.isError) {
    return <TopicalMapFailed what="this map's topic rows" error={topicRows.error} />;
  }

  // ── Rows ─────────────────────────────────────────────────────────────────
  const countsLoaded = includes.includes("counts");
  const storeHasIntents = Object.keys(workspace.intentsByPageId).length > 0;
  const intentsLoaded = wantsIntents && (intents.data !== undefined || storeHasIntents);
  const intentsPartial =
    intents.data && intents.data.total > intents.data.items.length
      ? { loaded: intents.data.items.length, total: intents.data.total }
      : null;
  const rollups = intentsLoaded
    ? rollupTopicIntents(workspace.intentsByPageId, workspace.coverageByPageId)
    : null;
  const updatedAtBySlug = topicRows.data
    ? new Map(topicRows.data.map((row) => [row.slug, row.updated_at] as const))
    : null;
  const enrichment = { rollups, updatedAtBySlug };

  const hierarchy = tableState.hierarchy;
  const rows: MapTableRow[] = hierarchy
    ? hierarchyRows(visible, topicsBySlug, enrichment)
    : flatRows(topicsBySlug, selectedSlug, checkedSlugs, enrichment);
  const allRows: MapTableRow[] = hierarchy
    ? flatRows(topicsBySlug, selectedSlug, checkedSlugs, enrichment)
    : rows;
  const topicCount = Object.keys(topicsBySlug).length;

  // ── Columns ──────────────────────────────────────────────────────────────
  const statusCounts = new Map<string, number>();
  const facetCounts = new Map<string, number>();
  for (const topic of Object.values(topicsBySlug)) {
    const status = topic.status ?? "active";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    for (const [key, value] of Object.entries(topic.facets ?? {})) {
      const pair = `${key}:${value}`;
      facetCounts.set(pair, (facetCounts.get(pair) ?? 0) + 1);
    }
  }
  const columnContext: MapTableColumnContext = {
    hierarchy,
    countsLoaded,
    intentsLoaded,
    intentsPartial,
    intentColors: knobs.intent_colors,
    statusOptions: [...statusCounts.entries()].map(([value, count]) => ({
      value,
      label: `${value} (${count})`,
    })),
    facetOptions: [...facetCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: `${value} (${count})` })),
    readOnly,
    onToggleExpand: (slug) => dispatch(toggleExpanded({ mapId, slug })),
  };
  const allColumns = buildMapTableColumns(columnContext);
  const columns: MatrxColumnDef<MapTableRow>[] = TABLE_COLUMN_IDS.map((id) => allColumns[id]);
  // The chosen columns lead, in their order; the hidden ones follow so the
  // package's Columns dialog can offer them back.
  const columnOrder: string[] = [
    ...visibleColumns,
    ...TABLE_COLUMN_IDS.filter((id) => !visibleColumns.includes(id)),
  ];
  const hiddenColumns: string[] = TABLE_COLUMN_IDS.filter((id) => !visibleColumns.includes(id));

  // ── R10: the query the table sees, and what a change means ───────────────
  const query: MatrxDataTableQueryState = hierarchy
    ? { ...emptyQuery(filters.text), sort: sortStateForSiblingSort(siblingSort) }
    : flatQuery;

  const goFlat = (next: MatrxDataTableQueryState, reason: FlipReason) => {
    dispatch(setTableHierarchy({ mapId, hierarchy: false }));
    setFlatQuery({ ...next, page: 1 });
    setFlipReason(reason);
  };

  const goHierarchy = () => {
    dispatch(setTableHierarchy({ mapId, hierarchy: true }));
    // The search box keeps its words across the switch; filters and the flat
    // sort have no meaning in the tree and are dropped.
    if (flatQuery.search !== filters.text) {
      dispatch(setFilters({ mapId, filters: { text: flatQuery.search } }));
    }
    setFlatQuery(emptyQuery());
    setFlipReason(null);
  };

  const handleQueryChange = (next: MatrxDataTableQueryState) => {
    if (!hierarchy) {
      setFlatQuery(next);
      return;
    }
    if (next.search !== filters.text) {
      dispatch(setFilters({ mapId, filters: { text: next.search } }));
    }
    if (hasActiveColumnFilter(next.columnFilters)) {
      goFlat(next, { kind: "filter" });
      return;
    }
    const current = sortStateForSiblingSort(siblingSort);
    const sortChanged =
      (next.sort?.id ?? null) !== (current?.id ?? null) ||
      (next.sort?.direction ?? null) !== (current?.direction ?? null);
    if (!sortChanged) return;
    const decision = classifyHierarchySort(next.sort);
    if (decision.kind === "sibling") {
      dispatch(setSiblingSort({ mapId, sort: decision.sort }));
    } else {
      goFlat(next, { kind: "sort", columnId: decision.sort.id });
    }
  };

  const processLocalRows = (
    input: MapTableRow[],
    state: MatrxDataTableQueryState,
  ): MapTableRow[] =>
    hierarchy
      ? input
      : filterAndSortRows(
          input,
          columns,
          state.columnFilters,
          state.sort,
          state.search,
          undefined,
          state.layeredFilters,
          state.searchMatchMode,
        );

  // ── Writes from the table ────────────────────────────────────────────────
  const saveEdits = async (edits: CellEditsMap) => {
    // A cleared name is REFUSED, not dropped: the table toasts "Changes saved"
    // on any resolve, so returning quietly told the person an edit landed while
    // the old name stayed on screen. Throwing puts the refusal in front of them
    // ("Couldn't save: A topic needs a name.") and keeps the draft to fix.
    const decision = topicPatchesFromEdits(edits);
    if ("refusal" in decision) throw new Error(decision.refusal);
    const patches = decision.patches;
    if (patches.length === 0) return;
    const result = await patchTopics.mutateAsync(patches);
    // Per-edit failures: the function's own sentence, one per refused edit.
    for (const error of result.errors) {
      toast.error(error.slug ? `${error.slug}: ${error.message}` : error.message);
    }
    if (result.errors.length > 0 && result.updated.length === 0) {
      throw new Error("None of the edits were accepted.");
    }
  };

  const openPanel = (slug: string) => {
    dispatch(selectTopic({ mapId, slug }));
    openTopicPanel({ mapId, slug, siteId });
  };

  const copySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug);
      toast.success(`Copied "${slug}"`);
    } catch {
      toast.error(`Could not reach the clipboard — the slug is ${slug}`);
    }
  };

  const menuSection = contextRow
    ? buildTopicMenuSection({
        mapId,
        slug: contextRow.slug,
        label: contextRow.name,
        links,
        actions: {
          onOpenPanel: () => openPanel(contextRow.slug),
          onCopySlug: () => void copySlug(contextRow.slug),
          ...(readOnly
            ? {}
            : {
                onRename: () =>
                  setPendingRename({ slug: contextRow.slug, name: contextRow.name }),
                onMove: () =>
                  toast.info(
                    hierarchy
                      ? `Drag "${contextRow.name}" onto its new parent, or onto the root strip to make it a root topic.`
                      : "Switch to Hierarchy, then drag the row onto its new parent.",
                  ),
                onRetire: () => setPendingRemoval({ verb: "retire", row: contextRow }),
                onReject: () => setPendingRemoval({ verb: "reject", row: contextRow }),
              }),
        },
      })
    : null;

  const removalConsequence = (pending: PendingRemoval): string => {
    const { row, verb } = pending;
    const counts = countsLoaded
      ? ` It has ${row.topic.pages ?? 0} live pages, ${row.topic.planned ?? 0} planned pages and ${row.topic.keywords ?? 0} keywords attached.`
      : " Its attachment counts are not loaded in this view.";
    const children = row.hasChildren
      ? verb === "retire"
        ? " Its child topics move up to its parent."
        : " Its child topics are rejected with it."
      : "";
    return verb === "retire"
      ? `"${row.name}" leaves the live map and is kept for history; it can never again be a page's destination.${counts} If anything attached blocks the retirement, the function refuses and names it here.${children}`
      : `"${row.name}" is turned down and leaves the live map; nothing is deleted.${counts} If anything attached blocks the rejection, the function refuses and names it here.${children}`;
  };

  const runRemoval = async () => {
    if (!pendingRemoval) return;
    const { row, verb } = pendingRemoval;
    try {
      if (verb === "retire") await retireTopics.mutateAsync({ slugs: [row.slug] });
      else await rejectTopics.mutateAsync({ slugs: [row.slug] });
      toast.success(`${verb === "retire" ? "Retired" : "Rejected"} "${row.name}"`);
      setPendingRemoval(null);
    } catch (error) {
      // The function's own sentence, unaltered; the dialog stays open.
      toast.error(topicalMapErrorText(error));
    }
  };

  const flipNote =
    !hierarchy && flipReason ? (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {flipReason.kind === "sort"
            ? `Sorted by ${TABLE_COLUMN_LABELS[flipReason.columnId as TableColumnId] ?? flipReason.columnId} — every topic in one flat list, indent off, so the order is honest.`
            : "Filtered — every matching topic in one flat list, indent off, so the order is honest."}
        </span>
        <button
          type="button"
          onClick={goHierarchy}
          className="rounded-sm font-medium text-primary hover:underline"
        >
          Back to hierarchy
        </button>
      </p>
    ) : undefined;

  if (topicCount === 0) {
    return (
      <TopicalMapEmpty
        title="This map has no topics yet"
        detail="Nothing has been generated or added. A map builder run, or an agent using the topical_map tool, fills the tree; until then there is genuinely nothing to put in a table."
      />
    );
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <MatrxDataTableHost>
        <NonEditableContextMenu
          sourceFeature="marketing"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(target) => {
            const id = (target as HTMLElement | null)
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = (id && rows.find((candidate) => candidate.slug === id)) || null;
            setContextRow(row);
            if (!row) return null;
            return { content: `${row.name} (${row.slug})` };
          }}
          extraSections={menuSection ? [menuSection] : []}
        >
          <MatrxDataTable<MapTableRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.slug}
            tableId="topical-map-topics"
            isFetching={tree.isFetching || intents.isFetching}
            query={{
              mode: "controlled-local",
              state: query,
              onStateChange: handleQueryChange,
            }}
            processLocalRows={processLocalRows}
            columnState={{
              order: columnOrder,
              hidden: hiddenColumns,
              onChange: (next) =>
                dispatch(
                  setTableColumns({
                    mapId,
                    columns: next.order.filter((id) => !next.hidden.includes(id)),
                  }),
                ),
            }}
            selectedId={selectedSlug}
            onSelectedIdChange={(id) => dispatch(selectTopic({ mapId, slug: id }))}
            detail={{ enabled: false }}
            window={{ enabled: false }}
            onRowOpen={(row) => openPanel(row.slug)}
            selection={{
              selectedIds: [...checkedSlugs],
              onSelectedIdsChange: (slugs) => dispatch(setCheckedTopics({ mapId, slugs })),
              noun: "topic",
              actions: (selected) => (
                <OpenPagesAction mapId={mapId} siteId={siteId} host={host} selected={selected} />
              ),
            }}
            {...(readOnly ? {} : { edit: { enabled: true, onSave: saveEdits } })}
            {...(hierarchy && !readOnly
              ? {
                  hierarchy: {
                    rows: allRows,
                    getParentId: (row: MapTableRow) => row.topic.parentSlug,
                    itemLabel: (row: MapTableRow) => row.name,
                    rootDropLabel: "Drop here to make this a root topic",
                    onMove: async (row: MapTableRow, move: { parentId: string | null }) => {
                      try {
                        await moveTopic.mutateAsync({
                          slug: row.slug,
                          newParentSlug: move.parentId,
                        });
                      } catch (error) {
                        toast.error(topicalMapErrorText(error));
                      }
                    },
                  },
                }
              : {})}
            toolbar={{
              searchPlaceholder: "Search topics…",
              leading: flipNote,
              facets: [
                {
                  type: "button-group",
                  id: "rows",
                  label: "Rows",
                  value: hierarchy ? "hierarchy" : "flat",
                  defaultValue: "hierarchy",
                  options: [
                    { value: "hierarchy", label: "Hierarchy" },
                    { value: "flat", label: "Flat" },
                  ],
                  onChange: (value) => {
                    if (value === "hierarchy" && !hierarchy) goHierarchy();
                    else if (value === "flat" && hierarchy) goFlat(emptyQuery(filters.text), null);
                  },
                },
              ],
              actions:
                tableState.columns !== null ? (
                  <button
                    type="button"
                    onClick={() => dispatch(setTableColumns({ mapId, columns: null }))}
                    title="Back to the columns this organization shows by default"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Columns3 className="h-3.5 w-3.5" aria-hidden />
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    Default columns
                  </button>
                ) : undefined,
            }}
            emptyState={{
              title: "No topics match",
              description: hierarchy
                ? "Clear the search to see every topic."
                : "Adjust the search or clear the column filters.",
            }}
          />
        </NonEditableContextMenu>
      </MatrxDataTableHost>

      {pendingRename ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRename(null);
          }}
          title="Rename topic"
          description={`The slug "${pendingRename.slug}" stays the same; only the name changes.`}
          defaultValue={pendingRename.name}
          confirmLabel="Rename"
          busy={patchTopics.isPending}
          onConfirm={async (value) => {
            const name = value.trim();
            if (name === pendingRename.name) {
              setPendingRename(null);
              return;
            }
            try {
              const result = await patchTopics.mutateAsync([{ slug: pendingRename.slug, name }]);
              for (const error of result.errors) toast.error(error.message);
              if (result.errors.length === 0) setPendingRename(null);
            } catch (error) {
              toast.error(topicalMapErrorText(error));
            }
          }}
        />
      ) : null}

      {pendingRemoval ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRemoval(null);
          }}
          title={pendingRemoval.verb === "retire" ? "Retire this topic?" : "Reject this topic?"}
          description={removalConsequence(pendingRemoval)}
          confirmLabel={pendingRemoval.verb === "retire" ? "Retire" : "Reject"}
          variant="destructive"
          busy={retireTopics.isPending || rejectTopics.isPending}
          onConfirm={runRemoval}
        />
      ) : null}
    </div>
  );
}
