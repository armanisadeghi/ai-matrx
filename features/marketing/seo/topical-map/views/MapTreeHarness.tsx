"use client";

/**
 * PHASE 0 SCAFFOLDING — the U1 tree harness, lifted out of
 * `TopicalMapWorkspaceBody` unchanged so that outline, table and graph can each
 * be a real view file today while still drawing the same thing.
 *
 * It is ONE copy on purpose: three files rendering three copies of the same
 * harness would be three things to keep in step for the days between Phase 0
 * and the real drawings. Lanes A, B and C each replace their view's body with
 * its real rendering; when the last of them lands, this file has no importers
 * left and goes with it.
 *
 * Nothing here fetches anything the views do not already need: `map_tree` is
 * one query key for all three screens, which is why switching views does not
 * re-fetch.
 */

import type { ReactNode } from "react";

import { useAppSelector } from "@/lib/redux/hooks";

import { MapTopicTreeList } from "../components/MapTopicTreeList";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "../components/TopicalMapStates";
import { useMapDiagnostics, useMapTree } from "../hooks";
import { selectMapSelectedSlug, selectMapTotals } from "../redux/selectors";

/**
 * What `map_tree` is asked for. Every view needs the same projection, so one
 * list serves all of them and the query cache is shared across a view switch.
 */
export const TREE_INCLUDE = ["description", "status", "counts", "facets"];

export interface MapTreeHarnessProps {
  mapId: string;
  siteId: string | null;
  /** The screen this harness is standing in for — printed, never branched on. */
  view: string;
  /** Extra controls beside the summary (the outline's "Open topic", today). */
  actions?: ReactNode;
  /** `seo.map_diagnostics`, which the outline owns. */
  showDiagnostics?: boolean;
}

export function MapTreeHarness({
  mapId,
  siteId,
  view,
  actions,
  showDiagnostics = false,
}: MapTreeHarnessProps) {
  const tree = useMapTree(mapId, {
    include: TREE_INCLUDE,
    siteId: siteId ?? undefined,
  });
  const diagnostics = useMapDiagnostics(mapId, siteId, undefined, showDiagnostics);
  const totals = useAppSelector(selectMapTotals(mapId));
  const selectedSlug = useAppSelector(selectMapSelectedSlug(mapId));

  if (tree.isPending) return <TopicalMapLoading what="this map's topics" />;
  if (tree.isError)
    return <TopicalMapFailed what="this map's topics" error={tree.error} />;

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {view} view
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {totals.topicsTotal} topics · {totals.pages} live pages ·{" "}
          {totals.planned} planned · {totals.keywords} keywords
          {totals.proposed > 0 ? ` · ${totals.proposed} proposed` : ""}
        </p>
        {/* Selection is slice state, so this line reads the same after a view
            switch — the visible proof of U1's done-criterion. */}
        <p className="mt-1 text-sm">
          Selected topic:{" "}
          <span className="font-mono">{selectedSlug ?? "none"}</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Rendered from the shared store through the U1 selectors. The outline,
          table and graph drawings are built on top of this same tree.
        </p>
        {actions ? <div className="mt-3">{actions}</div> : null}
      </section>

      {totals.topicsLoaded === 0 ? (
        <TopicalMapEmpty
          title="This map has no topics yet"
          detail="Nothing has been generated or added. A map builder run, or an agent using the topical_map tool, fills the tree; until then there is genuinely nothing to show."
        />
      ) : (
        <MapTopicTreeList mapId={mapId} />
      )}

      {showDiagnostics && diagnostics.isError ? (
        <TopicalMapFailed
          what="this map's diagnostics"
          error={diagnostics.error}
        />
      ) : showDiagnostics && diagnostics.data ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">Diagnostics</p>
          <p className="mt-1 text-muted-foreground">
            {diagnostics.data.topics_empty} empty ·{" "}
            {diagnostics.data.topics_crowded.length} crowded ·{" "}
            {diagnostics.data.topics_proposed.length} still proposed ·{" "}
            {diagnostics.data.pages_on_no_topic} pages on no topic ·{" "}
            {diagnostics.data.sites_using_map.length} site(s) using this map
          </p>
        </section>
      ) : null}
    </>
  );
}
