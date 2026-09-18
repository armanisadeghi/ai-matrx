"use client";

/**
 * THE ONE canonical body of the map workspace (CONTRACTS.md §1, R5).
 *
 * 🚨 IT RENDERS NO PAGE CHROME. Its root is `h-full min-h-0 flex flex-col` and
 * nothing else — no background, no scroll container, no header offset. That is
 * the whole point of the Phase 0 inversion: the same body has to render inside
 * a route, a floating window, a drawer, a canvas card and a peek, and four of
 * those five hosts already own their own frame. A body that carried page chrome
 * could only ever live on the page (and a window wrapping it would double every
 * border — "don't wrap a component in wrappers", CLAUDE.md).
 *
 * The route adapter that owns the chrome is `TopicalMapRouteBody.tsx`. It is
 * also the ONLY place `useMapWorkspaceParams`, `useMarketingBrand`,
 * `usePathname` and `useSearchParams` are read for this body — none of them
 * works, or even resolves, in the other four hosts.
 *
 * Views are ROUTES on the page host, so each switch unmounts this component.
 * Everything the user chose — selection, expansion, the site in scope — lives
 * in the topical-map slice and is therefore still there on the other side.
 */

import { useEffect } from "react";

import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingTopicalMapScope } from "@/features/surfaces/manifests/marketing-topical-map.manifest";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";

import {
  selectMapExpandedSlugs,
  selectMapIntentsByPageId,
  selectMapLoadedAt,
  selectMapSelectedSlug,
  selectMapTotals,
  selectVisibleMapTopics,
} from "../redux/selectors";
import { mapOpened, revealTopic, setSiteId, setView } from "../redux/slice";
import { isMapViewKey } from "../redux/types";
import type { MapWorkspaceScreen } from "../useMapWorkspaceParams";
import { GraphView } from "../views/GraphView";
import { HistoryView } from "../views/HistoryView";
import { OutlineView } from "../views/OutlineView";
import { PagesWorkspace } from "../views/PagesWorkspace";
import { TableView } from "../views/TableView";
import { TextView } from "../views/TextView";

/** Where this body is standing. Five hosts, one body (CONTRACTS §1). */
export type MapHost = "page" | "window" | "drawer" | "canvas" | "peek";

export interface TopicalMapWorkspaceBodyProps {
  mapId: string;
  screen: MapWorkspaceScreen;
  /** `?site=` or the window's own choice. null = every site the caller may view. */
  siteId: string | null;
  host: MapHost;
  /** A record-only grantee, or a canvas viewer. Every write control is absent, not disabled. */
  readOnly?: boolean;
  /**
   * Page host: the adapter navigates. Window/canvas host: the owner keeps the
   * screen in its own state.
   *
   * Phase 0 has no in-body screen switcher — the shell header owns navigation
   * on the page, and the window's title-bar switcher is Lane G's — so nothing
   * below calls this yet. It is declared here because the hosts are built
   * against this contract, not because it is wired.
   */
  onScreenChange?: (screen: MapWorkspaceScreen) => void;
  /**
   * The topic to reveal once the tree is loaded (`?topic=` on the page host).
   * The body never reads the URL itself — see the header.
   */
  revealSlug?: string | null;
}

/** Every view file takes exactly this, and reads the rest from the store. */
export interface MapViewProps {
  mapId: string;
  siteId: string | null;
  host: MapHost;
  readOnly: boolean;
}

const SURFACE_NAME = "matrx-user/marketing-topical-map";

export function TopicalMapWorkspaceBody({
  mapId,
  screen,
  siteId,
  host,
  readOnly = false,
  revealSlug = null,
}: TopicalMapWorkspaceBodyProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    dispatch(mapOpened({ mapId }));
  }, [dispatch, mapId]);

  useEffect(() => {
    if (isMapViewKey(screen)) dispatch(setView({ mapId, view: screen }));
  }, [dispatch, mapId, screen]);

  useEffect(() => {
    dispatch(setSiteId({ mapId, siteId }));
  }, [dispatch, mapId, siteId]);

  // `?topic=<slug>` arrives from the topic id door. Reveal it — expanding every
  // ancestor — once the tree it names is actually loaded, or the reveal walks a
  // map with no rows in it and silently does nothing. `loadedAt` is the slice's
  // own record of the tree landing, so the body needs no query of its own.
  const treeLoadedAt = useAppSelector(selectMapLoadedAt(mapId));
  useEffect(() => {
    if (revealSlug && treeLoadedAt) {
      dispatch(revealTopic({ mapId, slug: revealSlug }));
    }
  }, [dispatch, mapId, revealSlug, treeLoadedAt]);

  /**
   * The surface scope, built at Run time from the live store — never on mount,
   * and never from a snapshot this component happened to render with.
   *
   * ABSENT IS NOT ZERO applies to the emitter too: a count the tree was not
   * loaded with is OMITTED from `visible_topics`, and `page_intent_total` is
   * deliberately not emitted at all — the slice holds the rows this workspace
   * has LISTED, which is not the server's matched total, and an agent told
   * otherwise would reason about a number nobody measured.
   */
  const getScope = () => {
    const state = store.getState();
    const totals = selectMapTotals(mapId)(state);
    const visible = selectVisibleMapTopics(mapId)(state);
    const intents = selectMapIntentsByPageId(mapId)(state);
    const intentRows = Object.entries(intents);
    const selectedSlug = selectMapSelectedSlug(mapId)(state);
    return createMarketingTopicalMapScope({
      map_id: mapId,
      map_screen: screen,
      ...(siteId ? { site_id: siteId } : {}),
      ...(totals.topicsTotal > 0 ? { topic_total: totals.topicsTotal } : {}),
      ...(selectedSlug ? { selected_topic_slug: selectedSlug } : {}),
      expanded_topic_slugs: [...selectMapExpandedSlugs(mapId)(state)],
      visible_topics: visible.map((row) => ({
        slug: row.slug,
        name: row.name,
        depth: row.depth,
        ...(row.topic.status ? { status: row.topic.status } : {}),
        ...(totals.countsLoaded
          ? {
              pages: row.topic.pages ?? 0,
              planned: row.topic.planned ?? 0,
              keywords: row.topic.keywords ?? 0,
            }
          : {}),
      })),
      ...(intentRows.length > 0
        ? {
            page_intents: intentRows.map(([pageId, intent]) => ({
              page_id: pageId,
              disposition: intent.disposition,
              state: intent.state,
              source: intent.source,
              ...(intent.topic ? { topic_slug: intent.topic.slug } : {}),
            })),
          }
        : {}),
    });
  };

  const viewProps: MapViewProps = { mapId, siteId, host, readOnly };

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={getScope}>
      <div className="flex h-full min-h-0 flex-col gap-4">
        {screen === "pages" ? (
          <PagesWorkspace {...viewProps} />
        ) : screen === "history" ? (
          <HistoryView {...viewProps} />
        ) : screen === "text" ? (
          <TextView {...viewProps} />
        ) : screen === "table" ? (
          <TableView {...viewProps} />
        ) : screen === "graph" ? (
          <GraphView {...viewProps} />
        ) : (
          <OutlineView {...viewProps} />
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
