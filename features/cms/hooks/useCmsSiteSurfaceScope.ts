"use client";

/**
 * Build the `matrx-user/cms-site` surface scope at trigger time.
 *
 * Returns a `() => SurfaceScopePayload` builder so the site dashboard /
 * components / collections / settings chrome reads the site-level cache
 * (`useSiteContext()`) at click time rather than baking a stale snapshot into
 * state. Feeds BOTH the v3 context menus (`contextData`) and the header Agents
 * chrome (`<SurfaceRuntimeProvider getScope=…>`).
 *
 * Tabs that hold data the layout does not (Collections, Settings) pass their
 * extras here and mount their own nested provider — deepest provider wins, so
 * their richer scope replaces the layout's while they are mounted.
 */

import { useCallback } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  buildCmsSiteContextData,
  type CmsSiteMode,
  type CmsSiteSettingsDraft,
} from "../agent-context/buildCmsSiteContextData";
import type {
  ClientComponent,
  ClientPageSummary,
  ClientSite,
  ClientSiteSummary,
  SiteCollectionSummary,
} from "../types";

export interface UseCmsSiteSurfaceScopeParams {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  allSites: readonly ClientSiteSummary[];
  currentMode: CmsSiteMode;
  selectedPageId?: string;
  /** Collections tab only. */
  collections?: readonly SiteCollectionSummary[];
  /** Settings tab only. */
  settingsDraft?: CmsSiteSettingsDraft;
}

export function useCmsSiteSurfaceScope(
  params: UseCmsSiteSurfaceScopeParams,
): () => SurfaceScopePayload {
  const {
    site,
    pages,
    components,
    allSites,
    currentMode,
    selectedPageId,
    collections,
    settingsDraft,
  } = params;

  return useCallback(
    () =>
      buildCmsSiteContextData({
        site,
        pages,
        components,
        allSites,
        currentMode,
        selectedPageId,
        collections,
        settingsDraft,
      }) as SurfaceScopePayload,
    [
      site,
      pages,
      components,
      allSites,
      currentMode,
      selectedPageId,
      collections,
      settingsDraft,
    ],
  );
}
