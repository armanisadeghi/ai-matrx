"use client";

// lib/entity-list/components/EntityListPage.tsx
//
// The canonical feature-entry list page, proven on /agents/all. One
// `<EntityListPage config={...} />` per surface — the feature supplies a
// config (service, columns, scopes, actions hook, views) and slots (header
// actions, notice, empty action); the shell owns everything else.
//
// Two halves, deliberately separate:
//   STYLE (view, density, sort, page size, columns) → useListViewPrefs,
//     persisted per user and synced across devices.
//   QUERY (scope, search, filters, page) → useEntityList, always starts clean.

import type { ReactNode } from "react";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { toast } from "@/lib/toast";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemContextMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  commitUrlParams,
  useUrlSearchParams,
} from "@/lib/url-state/useUrlState";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { defaultHiddenColumns } from "../columns";
import type { ListScope, ListScopeKind } from "@/lib/list-scope/types";
import type { EntityListConfig, EntityListController } from "../config";
import { useEntityList } from "../useEntityList";
import { readSortFromParams, sortToParamPatch } from "../urlQuery";
import { entityListRowHref } from "../doors";
import { countActiveFilters } from "../types";
import { EntityScopeTabs } from "./EntityScopeTabs";
import { EntityListToolbar } from "./EntityListToolbar";
import { EntityListTable } from "./EntityListTable";

const EMPTY_ITEM_MENU_CONFIG: ItemMenuConfig = { sections: [] };

/**
 * Bind an agent surface to a list page.
 *
 * A list surface has exactly one honest set of values — what is on screen, in
 * which scope, out of what total — and every list page would otherwise hand-roll
 * a `SurfaceRuntimeProvider` around a copy of state the shell already holds and
 * the page does not. So the shell offers it: name the surface, map the live
 * controller to its manifest values, done. The scope is built at Run time only
 * (never on mount), so this costs a page that never launches an agent nothing.
 */
export interface EntityListSurfaceController<
  TRow,
> extends EntityListController<TRow> {
  /** The exact persisted view state the list currently renders. */
  view: Pick<
    ListViewPrefs,
    "sort" | "direction" | "favoritesFirst" | "pageSize"
  >;
  /** Apply view changes through the same preference/URL path as the toolbar. */
  patchView: (patch: Partial<ListViewPrefs>) => void;
}

export interface EntityListSurface<TRow> {
  /** Canonical `ui_surface.name`, from the feature's manifest. */
  surfaceName: string;
  /** Live manifest values, read from the same controller the list renders. */
  getScope: (list: EntityListSurfaceController<TRow>) => SurfaceScopePayload;
  /** Optional handlers for manifest-declared writes into this list's UI. */
  getWriteHandlers?: (
    list: EntityListSurfaceController<TRow>,
  ) => SurfaceWriteHandlers;
}

export interface EntityListPageProps<TRow> {
  config: EntityListConfig<TRow>;
  /**
   * Banner slot above the tabs (a dismissible migration notice, or a control
   * that narrows the list). A function receives the live controller, so a
   * surface can put a first-class query control up there — /work/conversations
   * uses it for the door to the internal machine runs its default hides —
   * without hand-rolling a second copy of the query state.
   */
  notice?: ReactNode | ((list: EntityListController<TRow>) => ReactNode);
  /** Buttons on the right of the scope tabs (New, secondary destinations). */
  headerActions?: ReactNode;
  /** Action rendered inside the empty state (usually the New button again). */
  emptyAction?: ReactNode;
  /** Agent surface this list emits its live values to (manifest-backed). */
  surface?: EntityListSurface<TRow>;
  /**
   * The scopes to render, overriding `config.scopes`. Only a page can decide a
   * scope that depends on WHO is looking — `system` is Matrx-admin only — and
   * a module-constant config cannot read auth state. Values still come from
   * the shared vocabulary; this is which subset, never a new one.
   */
  scopes?: ListScopeKind[];
  /**
   * Where this page STARTS when that is not "Mine" — e.g. the admin System
   * Agents route, whose whole shell is already about the platform corpus.
   * The tabs still switch away from it.
   */
  defaultScope?: ListScope;
}

export function EntityListPage<TRow>({
  config,
  notice,
  headerActions,
  emptyAction,
  surface,
  scopes,
  defaultScope,
}: EntityListPageProps<TRow>) {
  const visibleScopes = scopes ?? config.scopes;
  const defaultHidden = defaultHiddenColumns(config.columns);
  const { prefs, setPrefs, reset } = useListViewPrefs(config.surfaceKey, {
    version: config.prefsVersion,
    hiddenColumns: defaultHidden,
    ...config.prefsDefaults,
  });

  // Sort is STYLE (persisted per user), but it is also the one style axis a
  // SHARED LINK has to carry — "look at this list, newest first" is worthless
  // if the recipient's stored preference silently re-sorts it. So on a
  // URL-backed surface the URL wins when present, and writing a sort updates
  // both: the link stays truthful and the preference still persists.
  const urlParams = useUrlSearchParams();
  const prefsSort = { sort: prefs.sort, direction: prefs.direction };
  const effectiveSort = config.urlState
    ? readSortFromParams(urlParams, prefsSort)
    : prefsSort;

  const commitSort = (next: { sort: string; direction: "asc" | "desc" }) => {
    setPrefs(next);
    if (config.urlState) {
      commitUrlParams(sortToParamPatch(next, prefsSort), "push");
    }
  };

  const patchView = (patch: Partial<ListViewPrefs>) => {
    const { sort, direction, ...rest } = patch;
    if (sort !== undefined || direction !== undefined) {
      commitSort({
        sort: sort ?? effectiveSort.sort,
        direction: direction ?? effectiveSort.direction,
      });
    }
    if (Object.keys(rest).length > 0) setPrefs(rest);
  };

  // An empty RESULT is not an empty LIST. Saying "Nothing here yet — create
  // your first one" to someone who has 117 rows and mistyped a search is a lie,
  // and it buries the actual way out (clear the search). Resolved here, where
  // the query lives, and handed to every view so they cannot disagree.
  const list = useEntityList<TRow>({
    service: config.service,
    getRowId: config.getRowId,
    entityLabelPlural: config.entityLabel.plural,
    defaultFilters: config.defaultFilters,
    defaultScope,
    urlState: config.urlState,
    view: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: prefs.favoritesFirst,
      pageSize: prefs.pageSize,
    },
  });

  const { actions, modals } = config.useRowActions(list);

  // Owner / org / access columns only carry information outside "Mine", where
  // every row has the same owner. Offering them there is pure noise.
  const showSharedColumns = list.query.scope.kind !== "mine";

  /**
   * Commit the table's pending inline edits. Each row is one UPDATE; the local
   * row is patched so the list reflects the change without a refetch flash,
   * and a failure re-throws so the table keeps the draft and toasts.
   */
  const saveEdits = async (edits: Record<string, Partial<TRow>>) => {
    const save = config.edit?.save;
    if (!save) return;
    const entries = Object.entries(edits);
    await Promise.all(
      entries.map(async ([rowId, edit]) => {
        const row = list.rows.find((r) => config.getRowId(r) === rowId);
        if (!row) throw new Error("Edited row is no longer in the list");
        await save(row, edit);
        list.patchRow(rowId, edit);
      }),
    );
    const { singular, plural } = config.entityLabel;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    toast.success(
      entries.length === 1
        ? `${cap(singular)} updated`
        : `${entries.length} ${plural} updated`,
    );
  };

  const isNarrowed =
    Boolean(list.query.search.trim()) || countActiveFilters(list.query) > 0;

  const resolvedEmptyState = isNarrowed
    ? {
        title: `No ${config.entityLabel.plural} match`,
        description:
          "Nothing matched your current search and filters. Widen them, or check a different scope.",
        // Clears the SEARCH too — `resetFilters` alone leaves the search term
        // in place, so the "way out" button would have left the user staring at
        // the same empty result.
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              list.setSearch("");
              list.resetFilters();
            }}
          >
            Clear search and filters
          </Button>
        ),
      }
    : { ...config.emptyState, action: emptyAction };

  const cardsView = config.views?.cards;
  const rowsView = config.views?.rows;
  // A stored preference for a view this surface doesn't provide falls back to
  // the table rather than rendering nothing.
  const view =
    prefs.view === "cards" && cardsView
      ? "cards"
      : prefs.view === "rows" && rowsView
        ? "rows"
        : "table";

  const altViewProps = {
    rows: list.rows,
    density: prefs.density,
    showShared: showSharedColumns,
    actions,
    // The same door the table puts on the name cell, handed to every alternate
    // view. Switching to cards or dense rows must not cost the user cmd-click,
    // middle-click and keyboard focus on the record's name.
    hrefFor: (row: TRow) => entityListRowHref(config, row),
  };

  const surfaceList: EntityListSurfaceController<TRow> = {
    ...list,
    view: {
      sort: effectiveSort.sort,
      direction: effectiveSort.direction,
      favoritesFirst: prefs.favoritesFirst,
      pageSize: prefs.pageSize,
    },
    patchView,
  };

  const page = (
    <div className="flex h-full flex-col overflow-hidden">
      {/*
        The scope tabs and toolbar are STATIC interactive content at the top, so
        they must clear the glass header rather than scroll behind it — hence
        pt-[var(--shell-header-h)] (never a hardcoded pt-12). Only the list body
        below scrolls behind the glass.
      */}
      <div className="shrink-0 space-y-1.5 px-3 pt-[calc(var(--shell-header-h)+0.5rem)] pb-2 sm:space-y-2">
        {typeof notice === "function" ? notice(list) : notice}
        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0 flex-1 sm:flex-none">
            <EntityScopeTabs
              scope={list.query.scope}
              scopes={visibleScopes}
              counts={list.counts}
              onChange={list.setScope}
            />
          </div>
          {headerActions && (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {headerActions}
            </div>
          )}
        </div>

        <EntityListToolbar
          query={list.query}
          facets={list.facets}
          isFetching={list.isFetching}
          prefs={{ ...prefs, ...effectiveSort }}
          showSharedColumns={showSharedColumns}
          columns={config.columns}
          defaultHidden={defaultHidden}
          facetSections={config.facetSections}
          hasFavorites={Boolean(config.favorite)}
          hasArchived={config.supportsArchived !== false}
          searchPlaceholder={`Search ${config.entityLabel.plural}…`}
          deepSearchLabel={config.deepSearch?.label}
          hasCards={Boolean(cardsView)}
          hasRows={Boolean(rowsView)}
          onSearch={list.setSearch}
          onPatchQuery={list.patchQuery}
          // Sort changes route through commitSort so the panel's sort and the
          // table header's sort write the same two places (prefs + URL).
          onPatchPrefs={patchView}
          onResetFilters={list.resetFilters}
          onResetView={reset}
        />

        {list.error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{list.error}</span>
            <Button size="sm" variant="ghost" onClick={list.refresh}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {view === "table" ? (
          <EntityListTable
            config={config}
            actions={actions}
            rows={list.rows}
            total={list.total}
            page={list.query.page}
            pageSize={prefs.pageSize}
            sort={effectiveSort.sort}
            direction={effectiveSort.direction}
            filters={list.query.filters}
            facets={list.facets}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            density={prefs.density}
            showSharedColumns={showSharedColumns}
            hiddenColumns={prefs.hiddenColumns}
            onSaveEdits={saveEdits}
            emptyState={resolvedEmptyState}
            onQueryChange={(next) => {
              if (
                next.sort !== effectiveSort.sort ||
                next.direction !== effectiveSort.direction
              ) {
                commitSort({ sort: next.sort, direction: next.direction });
              }
              if (next.pageSize !== prefs.pageSize) {
                setPrefs({ pageSize: next.pageSize });
              }
              if (
                JSON.stringify(next.filters) !==
                JSON.stringify(list.query.filters)
              ) {
                list.setFilters(next.filters);
              }
              list.setPage(next.page);
            }}
          />
        ) : list.rows.length === 0 && !list.isLoading ? (
          // Cards/rows views used to render literally nothing on an empty list —
          // the empty state (and its emptyAction door) existed only in the table
          // branch, so a user whose saved view style was "cards" met a blank
          // page with no title, no explanation, and no way forward.
          <EntityListEmpty state={resolvedEmptyState} />
        ) : view === "cards" && cardsView ? (
          cardsView(altViewProps)
        ) : rowsView ? (
          rowsView(altViewProps)
        ) : null}

        {view !== "table" && (
          <LoadMoreFooter
            loaded={list.rows.length}
            total={list.total}
            page={list.query.page}
            pageSize={prefs.pageSize}
            onPage={list.setPage}
          />
        )}
      </div>

      {modals}
    </div>
  );

  // ONE context menu wraps the pane. MatrxDataTable already stamps
  // `data-row-id`; feature-owned cards/rows owe the same anchor. Resolving the
  // row at open time keeps right-click and mobile long-press on the exact same
  // action registry as the kebab, without N nested menu roots.
  const pageWithContextMenu = (
    <ItemContextMenu
      config={EMPTY_ITEM_MENU_CONFIG}
      sourceFeature={config.sourceFeature}
      surfaceName={surface?.surfaceName}
      getApplicationScope={
        surface ? () => surface.getScope(surfaceList) : undefined
      }
      resolveItemOnOpen={(target) => {
        const rowId = target
          ?.closest("[data-row-id]")
          ?.getAttribute("data-row-id");
        const row = rowId
          ? list.rows.find((candidate) => config.getRowId(candidate) === rowId)
          : undefined;
        if (!row) {
          return {
            config: EMPTY_ITEM_MENU_CONFIG,
            context: { [CONTEXT_MENU_ENTITY_KEY]: null },
          };
        }
        return {
          config: actions.menuFor(row),
          context: {
            content: config.getRowName(row),
            [CONTEXT_MENU_ENTITY_KEY]: config.getRowEntity?.(row) ?? null,
          },
        };
      }}
    >
      {page}
    </ItemContextMenu>
  );

  if (!surface) return pageWithContextMenu;
  return (
    <SurfaceRuntimeProvider
      surfaceName={surface.surfaceName}
      getScope={() => surface.getScope(surfaceList)}
      getWriteHandlers={
        surface.getWriteHandlers
          ? () => surface.getWriteHandlers?.(surfaceList) ?? {}
          : undefined
      }
    >
      {pageWithContextMenu}
    </SurfaceRuntimeProvider>
  );
}

/** Empty state for the non-table views — same copy + action the table renders. */
function EntityListEmpty({
  state,
}: {
  state: { title: string; description: string; action?: ReactNode };
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{state.title}</p>
      <p className="text-xs text-muted-foreground">{state.description}</p>
      {state.action}
    </div>
  );
}

function LoadMoreFooter({
  loaded,
  total,
  page,
  pageSize,
  onPage,
}: {
  loaded: number;
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const shownThrough = (page - 1) * pageSize + loaded;
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {shownThrough} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={shownThrough >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
