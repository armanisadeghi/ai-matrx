"use client";

/**
 * PAGES — `seo.list_page_intents`: where every page related to this map sits
 * today, and where its one intent is sending it. The bulk convergence
 * workspace (CONTRACTS §9, lane F).
 *
 * This file is the SHELL and nothing else: it reads the knobs, builds the one
 * `PagesWorkspaceContext` every piece stands in (`./pages/seams.ts`, frozen by
 * the lane owner), owns the page/pageSize pair, and chooses which region is on
 * screen. The table, the filter bar, the bare-pages tab and the progress strip
 * live beside it; the bulk bar, the review deck and the run controls are the
 * two sibling builders' files, imported by their frozen props.
 *
 * ROUND 22 is load-bearing here and the reason this screen says so many things
 * out loud: a page never vanishes with its topic, `current_topics: []` is a
 * real state, and an intent whose destination left the map keeps the intent but
 * loses the `topic` key. Printing a blank cell for any of those would read as
 * "nothing to do". The cells that carry it are in `./pages/pageColumns.tsx`.
 *
 * 🚨 IT OPENS ON WHAT THE LINK ASKED FOR. A screen that knows which pages the
 * person came to work on says so in the query string — `?topic=`,
 * `?disposition=`, `?state=`, `?onNoTopic=1` — and this workspace applies them
 * ONCE, on mount, through `setPageFilters` (`./pages/pageFilterParams.ts` owns
 * the vocabulary and names anything it cannot honour). Only on the PAGE host:
 * a window, drawer or canvas has no URL of its own, and reading the address bar
 * there would hand it the filters of whatever page happens to be underneath it
 * (CONTRACTS §1 keeps URL reading on the route for the same reason).
 *
 * 🚨 NOTHING RENDERS BEFORE THE KNOBS. Every taste on this screen — the
 * convergence palette, the low-traffic threshold, the review mode, the bulk
 * confirmation rule — is an organization's choice, and `knobs.ts` has no code
 * fallback ON PURPOSE. So the shell splits in two: this component reads the
 * knobs and renders the honest loading / failed state, and the body below it
 * can only be constructed once they are in hand.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

import {
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import type { MapHost, MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { useMapDiagnostics } from "../hooks";
import { useTopicalMapKnobs, type TopicalMapKnobs } from "../knobs";
import { selectMapPageFilters, selectPagesOnNoTopic } from "../redux/selectors";
import { clearPageFilters, setPageFilters } from "../redux/slice";

import { PagesFilterBar } from "./pages/PagesFilterBar";
import { PagesOnNoTopicTable } from "./pages/PagesOnNoTopicTable";
import { PagesTable } from "./pages/PagesTable";
import { ProgressStrip } from "./pages/ProgressStrip";
import {
  ignoredParamsSentence,
  pageFiltersFromSearchParams,
} from "./pages/pageFilterParams";
import { hasAnyPageFilter, narrowPageRows, proposedIntentRows } from "./pages/pageRows";
import { usePagesQuery } from "./pages/usePagesQuery";
import { IntentReviewDeck } from "./pages/review/IntentReviewDeck";
import { MapRunControls } from "./pages/runs/MapRunControls";
import type { PagesWorkspaceContext } from "./pages/seams";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export function PagesWorkspace({ mapId, siteId, host, readOnly }: MapViewProps) {
  const { knobs, loading, error } = useTopicalMapKnobs();

  if (loading) return <TopicalMapLoading what="the pages workspace settings" />;
  if (error || !knobs) {
    return <TopicalMapFailed what="the pages workspace settings" error={error} />;
  }
  return (
    <PagesWorkspaceBody
      mapId={mapId}
      siteId={siteId}
      host={host}
      readOnly={readOnly}
      knobs={knobs}
    />
  );
}

function PagesWorkspaceBody({
  mapId,
  siteId,
  host,
  readOnly,
  knobs,
}: {
  mapId: string;
  siteId: string | null;
  host: MapHost;
  readOnly: boolean;
  knobs: TopicalMapKnobs;
}) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectOrganizationId);
  const filters = useAppSelector(selectMapPageFilters(mapId));
  const onNoTopicIds = useAppSelector(selectPagesOnNoTopic(mapId));

  // The sites using this map. A run control needs ONE site; when `siteId` is
  // null the bare-pages tab and the run controls choose from these.
  const diagnostics = useMapDiagnostics(mapId, siteId);
  const siteIds = diagnostics.data?.sites_using_map ?? [];

  // ── What the link asked for, applied once ────────────────────────────────
  // `useSearchParams()` is safe in every host (it answers the route's query
  // string wherever the component stands); what is NOT safe is ACTING on it
  // outside the page host, where the address bar belongs to something else.
  const searchParams = useSearchParams();
  const [ignoredParams, setIgnoredParams] = useState<string[]>([]);
  useEffect(() => {
    if (host !== "page") return;
    const { filters: fromUrl, ignored } = pageFiltersFromSearchParams(
      new URLSearchParams(searchParams.toString()),
    );
    setIgnoredParams(ignored);
    if (Object.keys(fromUrl).length > 0) {
      dispatch(setPageFilters({ mapId, filters: fromUrl }));
    }
    // ONCE per map, on arrival: after this the filter bar owns the filters, and
    // re-applying them on every render would fight the person's own clearing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, host]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(LIST_VIEW_PAGE_SIZES[1]);
  const [reviewing, setReviewing] = useState(false);

  // ANY filter change puts the person back on page 1. Staying on page 7 of the
  // previous, wider answer is how a filtered list shows an empty screen over a
  // result set that is not empty. `onNoTopic` is a filter too, so switching
  // tabs resets as well — the two tabs page different reads.
  const filterSignature = JSON.stringify(filters);
  useEffect(() => {
    setPage(1);
  }, [filterSignature]);

  const intents = usePagesQuery(mapId, filters, siteId, page, pageSize);

  const context: PagesWorkspaceContext = {
    mapId,
    siteId,
    readOnly,
    knobs,
    organizationId,
    siteIds,
  };

  const onQueryChange = (next: { page: number; pageSize: number }) => {
    setPage(next.page);
    if (next.pageSize !== pageSize) {
      setPageSize(next.pageSize);
      // A bigger page re-cuts the whole result set; keeping the old page number
      // would land on a different set of rows than the one the person left.
      setPage(1);
    }
  };

  const narrowed = narrowPageRows(
    intents.data?.items ?? [],
    filters,
    knobs.pages_low_traffic_clicks_max,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-1">
        <MapRunControls context={context} />
        <ProgressStrip
          siteId={siteId}
          items={intents.data ? narrowed.rows : null}
          topicSlug={filters.topicSlug}
        />
      </div>

      {ignoredParams.length > 0 ? (
        <ErrorNotice size="inline" className="shrink-0 text-xs" message={ignoredParamsSentence(ignoredParams)} />
      ) : null}

      <PagesFilterBar
        mapId={mapId}
        organizationId={organizationId}
        knobs={knobs}
        readOnly={readOnly}
        reviewing={reviewing}
        onReviewingChange={setReviewing}
      />

      {filters.onNoTopic ? (
        <PagesOnNoTopicTable
          mapId={mapId}
          siteId={siteId}
          siteIds={siteIds}
          page={page}
          pageSize={pageSize}
          onQueryChange={onQueryChange}
        />
      ) : intents.isPending ? (
        <TopicalMapLoading what="this map's pages" />
      ) : intents.isError ? (
        <TopicalMapFailed what="this map's pages" error={intents.error} mapId={mapId} />
      ) : reviewing && !readOnly ? (
        // The deck reviews what the person is LOOKING AT: the proposed intents
        // among the rows the filters left standing, not rows the filter bar
        // just hid.
        <IntentReviewDeck
          context={context}
          items={proposedIntentRows(narrowed.rows)}
          onSettled={() => {
            void intents.refetch();
          }}
        />
      ) : (
        <PagesTable
          context={context}
          result={intents.data}
          narrowed={narrowed}
          page={page}
          pageSize={pageSize}
          onQueryChange={onQueryChange}
          isFetching={intents.isFetching}
          onNoTopicCount={onNoTopicIds.length}
          filtersActive={hasAnyPageFilter(filters)}
          onClearFilters={() => dispatch(clearPageFilters({ mapId }))}
          onSettled={() => {
            void intents.refetch();
          }}
        />
      )}
    </div>
  );
}
