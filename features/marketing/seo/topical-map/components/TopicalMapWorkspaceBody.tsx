"use client";

/**
 * The ONE canonical body of the map workspace, rendered by six thin route
 * files — the shape the content plan already proved
 * (`ContentPlanRouteBody`, restructure 2026-08-29).
 *
 * Views are routes, so each switch unmounts this component. Everything the user
 * chose — which topic is selected, which branches are open, the site in scope —
 * lives in the topical-map slice and is therefore still there on the other
 * side. That is U1's done-criterion, and this file is where it is exercised.
 *
 * The bodies below are the U1 harness: real data through the U1 hooks, in the
 * plainest form. U2/U5/U6 replace each one with its real drawing; none of them
 * changes the read or the selector.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  useMapDiagnostics,
  useMapHistory,
  useMapOutline,
  useMapTree,
  usePageIntents,
} from "../hooks";
import {
  selectMapDuplicateIntents,
  selectMapSelectedSlug,
  selectMapTotals,
} from "../redux/selectors";
import { mapOpened, revealTopic, setSiteId, setView } from "../redux/slice";
import { isMapViewKey } from "../redux/types";
import { useMapWorkspaceParams } from "../useMapWorkspaceParams";
import { MapTopicTreeList } from "./MapTopicTreeList";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "./TopicalMapStates";

/**
 * What `map_tree` is asked for. Every view needs the same projection, so one
 * list serves all of them and the query cache is shared across a view switch —
 * which is also why switching views does not re-fetch.
 */
const TREE_INCLUDE = ["description", "status", "counts", "facets"];

export function TopicalMapWorkspaceBody({ mapId }: { mapId: string }) {
  const dispatch = useAppDispatch();
  const { screen, siteId } = useMapWorkspaceParams(mapId);

  useEffect(() => {
    dispatch(mapOpened({ mapId }));
  }, [dispatch, mapId]);

  useEffect(() => {
    if (isMapViewKey(screen)) dispatch(setView({ mapId, view: screen }));
  }, [dispatch, mapId, screen]);

  useEffect(() => {
    dispatch(setSiteId({ mapId, siteId }));
  }, [dispatch, mapId, siteId]);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
      <div className="mx-auto grid max-w-5xl gap-4 p-4 pt-[calc(var(--shell-header-h)+1rem)] sm:p-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
        {screen === "pages" ? (
          <MapPagesBody mapId={mapId} siteId={siteId} />
        ) : screen === "history" ? (
          <MapHistoryBody mapId={mapId} />
        ) : screen === "text" ? (
          <MapTextBody mapId={mapId} siteId={siteId} />
        ) : (
          <MapTreeBody mapId={mapId} siteId={siteId} view={screen} />
        )}
      </div>
    </div>
  );
}

/** Outline, table and graph all read the SAME tree — the point of U1. */
function MapTreeBody({
  mapId,
  siteId,
  view,
}: {
  mapId: string;
  siteId: string | null;
  view: string;
}) {
  const dispatch = useAppDispatch();
  const tree = useMapTree(mapId, {
    include: TREE_INCLUDE,
    siteId: siteId ?? undefined,
  });
  // `?topic=<slug>` arrives from the topic id door. Reveal it — expanding every
  // ancestor — once the tree it names is actually loaded, or the reveal walks a
  // map with no rows in it and silently does nothing.
  const focusSlug = useSearchParams().get("topic");
  const treeLoaded = Boolean(tree.data);
  useEffect(() => {
    if (focusSlug && treeLoaded) dispatch(revealTopic({ mapId, slug: focusSlug }));
  }, [dispatch, mapId, focusSlug, treeLoaded]);
  const diagnostics = useMapDiagnostics(mapId, siteId);
  const totals = useAppSelector(selectMapTotals(mapId));
  const selectedSlug = useAppSelector(selectMapSelectedSlug(mapId));

  if (tree.isPending) return <TopicalMapLoading what="this map's topics" />;
  if (tree.isError) return <TopicalMapFailed what="this map's topics" error={tree.error} />;

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
      </section>

      {totals.topicsLoaded === 0 ? (
        <TopicalMapEmpty
          title="This map has no topics yet"
          detail="Nothing has been generated or added. A map builder run, or an agent using the topical_map tool, fills the tree; until then there is genuinely nothing to show."
        />
      ) : (
        <MapTopicTreeList mapId={mapId} />
      )}

      {diagnostics.isError ? (
        <TopicalMapFailed what="this map's diagnostics" error={diagnostics.error} />
      ) : diagnostics.data ? (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">Diagnostics</p>
          <p className="mt-1 text-muted-foreground">
            {diagnostics.data.topics_empty} empty · {diagnostics.data.topics_crowded.length}{" "}
            crowded · {diagnostics.data.topics_proposed.length} still proposed ·{" "}
            {diagnostics.data.pages_on_no_topic} pages on no topic ·{" "}
            {diagnostics.data.sites_using_map.length} site(s) using this map
          </p>
        </section>
      ) : null}
    </>
  );
}

/** `seo.map_outline` — exactly what an agent receives, read-only and copyable. */
function MapTextBody({ mapId, siteId }: { mapId: string; siteId: string | null }) {
  const outline = useMapOutline(mapId, { siteId: siteId ?? undefined });

  if (outline.isPending) return <TopicalMapLoading what="the agent outline" />;
  if (outline.isError)
    return <TopicalMapFailed what="the agent outline" error={outline.error} />;

  if (!outline.data.trim()) {
    return (
      <TopicalMapEmpty
        title="The outline is empty"
        detail="seo.map_outline returned nothing, which means this map has no topics an agent could be shown yet."
      />
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Text view
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        This is the map exactly as an agent receives it (seo.map_outline), not a
        rendering of it.
      </p>
      <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs">
        {outline.data}
      </pre>
    </section>
  );
}

/** `seo.list_page_intents` — the read the bulk convergence workspace (U5) is built on. */
function MapPagesBody({ mapId, siteId }: { mapId: string; siteId: string | null }) {
  const intents = usePageIntents(mapId, { siteId });
  const duplicates = useAppSelector(selectMapDuplicateIntents(mapId));

  if (intents.isPending) return <TopicalMapLoading what="this map's pages" />;
  if (intents.isError)
    return <TopicalMapFailed what="this map's pages" error={intents.error} />;

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pages
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {intents.data.total} page(s) · traffic over the last{" "}
          {intents.data.performance_window_days} days
          {siteId ? "" : " · every site you can view that uses this map"}
        </p>
        {/* ONE INTENT PER PAGE is the contract. A non-zero count means edges had
            to be collapsed, and the screen says so rather than showing one. */}
        {duplicates > 0 ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {duplicates} page(s) carry more than one intent edge. Only the newest
            is shown for each. That should not happen — one intent per page is
            enforced by seo.set_page_intents, so another writer created them.
          </p>
        ) : null}
      </section>

      {intents.data.items.length === 0 ? (
        <TopicalMapEmpty
          title="No pages are related to this map yet"
          detail="A page appears here once it covers a topic or carries an intent. The page mapper writes the coverage edges; the intent proposer and the bulk workspace write the intents."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {intents.data.items.map((item) => (
            <li key={item.page.id} className="px-3 py-2 text-sm">
              <p className="truncate">{item.page.url ?? item.page.label ?? item.page.id}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.current_topics.length > 0
                  ? `covers ${item.current_topics.map((topic) => topic.slug).join(", ")}`
                  : "covers nothing yet"}
                {item.intent
                  ? ` · ${item.intent.disposition} → ${item.intent.topic.slug} (${item.intent.state})`
                  : " · no intent recorded"}
                {item.page.clicks != null
                  ? ` · ${item.page.clicks} clicks / ${item.page.impressions ?? 0} impressions`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** `seo.list_map_history` — what left the map, and who sent it there (U6's read). */
function MapHistoryBody({ mapId }: { mapId: string }) {
  const history = useMapHistory(mapId);

  if (history.isPending) return <TopicalMapLoading what="this map's history" />;
  if (history.isError)
    return <TopicalMapFailed what="this map's history" error={history.error} />;

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {history.data.total} topic(s) rejected or retired. Rejecting never
          deletes — the row stays and can be restored.
        </p>
      </section>

      {history.data.items.length === 0 ? (
        <TopicalMapEmpty
          title="Nothing has left this map"
          detail="No topic has been rejected or retired, so there is nothing to review or restore."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {history.data.items.map((entry) => (
            <li key={`${entry.slug}:${entry.changed_at}`} className="px-3 py-2 text-sm">
              <p className="truncate">
                {entry.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.slug}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.status} · {new Date(entry.changed_at).toLocaleString()}
                {entry.attachments ? " · still carries attachments" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
