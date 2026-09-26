"use client";

// features/marketing/seo/topical-map/views/pages/PagesTable.tsx
//
// THE "All pages" TABLE: one page of `seo.list_page_intents`, drawn through the
// canonical `MatrxDataTable` in CONTROLLED mode — the table owns none of the
// querying, because the read is paged on the server and a locally-sorted page
// would be a lie (see `./pageColumns.tsx`).
//
// The three sentences above the grid are not decoration; each one is a fact the
// person cannot recover from the rows:
//   * the total and the traffic window — the rows are a PAGE of a bigger answer,
//     and `performance_window_days` comes from THE READ, not the knob, because
//     the read reports the window it actually summed over;
//   * the on-no-topic count — a page never vanishes with its topic (round 22);
//   * the duplicate-intent alert — one intent per page is the contract, so a
//     non-zero count means another writer broke it and only the newest is shown.
//
// `readOnly` removes the checkbox column and the bulk bar ENTIRELY (the
// `selection` prop is spread, never passed as a zero state) — a disabled
// checkbox advertises a write the surface underneath would refuse.

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";

import { MatrxDataTableHost } from "@/components/official/MatrxDataTableHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";

import { TopicalMapEmpty } from "../../components/TopicalMapStates";
import { useMapLinks } from "../../links";
import { selectMapCheckedPageIds } from "../../redux/selectors";
import { setCheckedPages } from "../../redux/slice";
import type { PageIntentItem, PageIntentsResult } from "../../types";
import { pageColumns } from "./pageColumns";
import { narrowingSentence, type NarrowedPageRows } from "./pageRows";
import { PagesBulkActions } from "./bulk/PagesBulkActions";
import type { PagesWorkspaceContext, SetPageIntentsOutcome } from "./seams";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface PagesTableProps {
  context: PagesWorkspaceContext;
  /** The loaded page, exactly as the read returned it. */
  result: PageIntentsResult;
  /** The loaded page after `./pageRows.ts` narrowed it client-side. */
  narrowed: NarrowedPageRows;
  page: number;
  pageSize: number;
  onQueryChange: (next: { page: number; pageSize: number }) => void;
  isFetching: boolean;
  /** How many LOADED pages cover no live topic (`selectPagesOnNoTopic`). */
  onNoTopicCount: number;
  /** True when any filter — server or client — is narrowing the list. */
  filtersActive: boolean;
  onClearFilters: () => void;
  /** Called after a bulk write settled, so the workspace can refetch. */
  onSettled: (outcome: SetPageIntentsOutcome) => void;
}

export function PagesTable({
  context,
  result,
  narrowed,
  page,
  pageSize,
  onQueryChange,
  isFetching,
  onNoTopicCount,
  filtersActive,
  onClearFilters,
  onSettled,
}: PagesTableProps) {
  const dispatch = useAppDispatch();
  const links = useMapLinks();
  const checkedPageIds = useAppSelector(selectMapCheckedPageIds(context.mapId));

  const columns = pageColumns({ mapId: context.mapId, knobs: context.knobs, links });

  // Spread, never `selection={…}`: a read-only viewer must reach the table with
  // the key ABSENT, so no checkbox column and no bulk bar exist at all.
  const selection = context.readOnly
    ? undefined
    : {
        selectedIds: [...checkedPageIds],
        onSelectedIdsChange: (ids: string[]) => {
          dispatch(setCheckedPages({ mapId: context.mapId, ids }));
        },
        // A page with no `site_id` cannot be written: `seo.set_page_intents`
        // takes ONE site and the row does not say which. No checkbox at all
        // rather than one that would be refused.
        isRowSelectable: (item: PageIntentItem) => Boolean(item.page.site_id),
        noun: "page",
        actions: (selected: PageIntentItem[], selectedIds: string[]) => (
          <PagesBulkActions
            context={context}
            selected={selected}
            selectedIds={selectedIds}
            // Annotated from the FROZEN seam, not inferred from the sibling's
            // component: this callback's shape is `seams.ts`'s to declare, and
            // typing it here keeps the contract readable while that file is
            // still being written beside this one.
            onSettled={(outcome: SetPageIntentsOutcome) => {
              dispatch(setCheckedPages({ mapId: context.mapId, ids: [] }));
              onSettled(outcome);
            }}
          />
        ),
      };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="shrink-0 space-y-0.5 px-0.5">
        <p className="text-xs text-muted-foreground">
          {/* THE READ'S OWN WINDOW, not the knob: the knob says what to ask for,
              this number says what was summed. */}
          {result.total} pages · traffic over the last{" "}
          {result.performance_window_days} days
          {context.siteId ? "" : " · every site you can view that uses this map"}
        </p>
        {narrowed.narrowed ? (
          <p className="text-xs text-muted-foreground">
            {narrowingSentence(narrowed.rows.length, narrowed.loaded, result.total)}
          </p>
        ) : null}
        {/* ROUND 22: rejecting or retiring a topic does not delete its pages —
            they land here, on no topic. Saying nothing would let a map quietly
            shed its pages. */}
        {onNoTopicCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            {onNoTopicCount} of these page(s) cover no live topic of this map. A
            page never vanishes with its topic: rejecting or retiring a topic
            leaves its pages here to be re-homed.
          </p>
        ) : null}
        {/* ONE INTENT PER PAGE is the contract. A non-zero count means edges had
            to be collapsed, and the screen says so rather than showing one. */}
        {result.duplicate_intents > 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {result.duplicate_intents} page(s) carry more than one intent edge.
            Only the newest is shown for each. That should not happen — one
            intent per page is enforced by seo.set_page_intents, so another
            writer created them.
            <ErrorAlchemyMenu className="ml-auto" />
          </p>
        ) : null}
      </div>

      {narrowed.rows.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {filtersActive ? (
            <TopicalMapEmpty
              title="No pages match these filters"
              detail={
                narrowed.narrowed && narrowed.loaded > 0
                  ? `None of the ${narrowed.loaded} pages loaded on this page of results match. The rest of the ${result.total} are on other pages — clear the filters, or page through.`
                  : "Nothing in this map matches. Clear the filters to see every page again."
              }
              action={
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs hover:bg-accent"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <TopicalMapEmpty
              title="No pages are related to this map yet"
              detail="A page appears here once it covers a topic or carries an intent. The page mapper writes the coverage edges; the intent proposer and the bulk workspace write the intents."
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <MatrxDataTableHost>
            <MatrxDataTable<PageIntentItem>
              data={[...narrowed.rows]}
              columns={columns}
              getRowId={(item) => item.page.id}
              isFetching={isFetching}
              zebra
              className="text-xs [&_td]:py-1 [&_th]:py-1"
              pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
              query={{
                mode: "controlled",
                // The WHOLE answer, so the pager counts real pages of the read
                // rather than the handful the client narrowing left standing.
                totalItems: result.total,
                state: {
                  page,
                  pageSize,
                  search: "",
                  anyOf: "",
                  columnFilters: {},
                  // No column sorts (see ./pageColumns.tsx) — so there is no
                  // sort state to carry, and none is invented.
                  sort: null,
                },
                onStateChange: (next) => {
                  onQueryChange({ page: next.page, pageSize: next.pageSize });
                },
              }}
              // The filter bar above owns search; a second box inside the table
              // would be two affordances fighting over one query.
              toolbar={{ search: false }}
              detail={{ enabled: false }}
              window={{ enabled: false }}
              {...(selection ? { selection } : {})}
            />
          </MatrxDataTableHost>
        </div>
      )}
    </div>
  );
}
