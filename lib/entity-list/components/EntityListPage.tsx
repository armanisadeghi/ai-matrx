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
import { toast } from "@/lib/toast";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { defaultHiddenColumns } from "../columns";
import type { EntityListConfig } from "../config";
import { useEntityList } from "../useEntityList";
import { entityListRowHref } from "../doors";
import { EntityScopeTabs } from "./EntityScopeTabs";
import { EntityListToolbar } from "./EntityListToolbar";
import { EntityListTable } from "./EntityListTable";

export interface EntityListPageProps<TRow> {
  config: EntityListConfig<TRow>;
  /** Banner slot above the tabs (e.g. a dismissible migration notice). */
  notice?: ReactNode;
  /** Buttons on the right of the scope tabs (New, secondary destinations). */
  headerActions?: ReactNode;
  /** Action rendered inside the empty state (usually the New button again). */
  emptyAction?: ReactNode;
}

export function EntityListPage<TRow>({
  config,
  notice,
  headerActions,
  emptyAction,
}: EntityListPageProps<TRow>) {
  const defaultHidden = defaultHiddenColumns(config.columns);
  const { prefs, setPrefs, reset } = useListViewPrefs(config.surfaceKey, {
    version: config.prefsVersion,
    hiddenColumns: defaultHidden,
    ...config.prefsDefaults,
  });

  const list = useEntityList<TRow>({
    service: config.service,
    getRowId: config.getRowId,
    entityLabelPlural: config.entityLabel.plural,
    view: {
      sort: prefs.sort,
      direction: prefs.direction,
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/*
        The scope tabs and toolbar are STATIC interactive content at the top, so
        they must clear the glass header rather than scroll behind it — hence
        pt-[var(--shell-header-h)] (never a hardcoded pt-12). Only the list body
        below scrolls behind the glass.
      */}
      <div className="shrink-0 space-y-1.5 px-3 pt-[calc(var(--shell-header-h)+0.5rem)] pb-2 sm:space-y-2">
        {notice}
        <div className="flex min-w-0 items-center justify-between gap-1.5 sm:gap-2">
          <div className="min-w-0 flex-1 sm:flex-none">
            <EntityScopeTabs
              scope={list.query.scope}
              scopes={config.scopes}
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
          prefs={prefs}
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
          onPatchPrefs={setPrefs}
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
            sort={prefs.sort}
            direction={prefs.direction}
            filters={list.query.filters}
            facets={list.facets}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            density={prefs.density}
            showSharedColumns={showSharedColumns}
            hiddenColumns={prefs.hiddenColumns}
            onSaveEdits={saveEdits}
            emptyAction={emptyAction}
            onQueryChange={(next) => {
              if (
                next.sort !== prefs.sort ||
                next.direction !== prefs.direction ||
                next.pageSize !== prefs.pageSize
              ) {
                setPrefs({
                  sort: next.sort,
                  direction: next.direction,
                  pageSize: next.pageSize,
                });
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
