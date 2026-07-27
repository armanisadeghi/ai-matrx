"use client";

/**
 * Build the `matrx-user/cms` (hub) surface scope at trigger time.
 *
 * Mirrors `useCmsSiteSurfaceScope.ts`. Returns a `() => SurfaceScopePayload`
 * builder so the sites list reads live state at click time — feeding both the
 * v3 context menus (`contextData`) and the header Agents chrome
 * (`<SurfaceRuntimeProvider getScope=…>`).
 */

import { useCallback } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  buildCmsHubContextData,
  type CmsHubNewSiteDraft,
} from "../agent-context/buildCmsHubContextData";
import type { ClientSite } from "../types";

export interface UseCmsHubSurfaceScopeParams {
  sites: readonly ClientSite[];
  selectedSiteId?: string;
  newSiteDraft?: CmsHubNewSiteDraft;
  loadError?: string | null;
}

export function useCmsHubSurfaceScope(
  params: UseCmsHubSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { sites, selectedSiteId, newSiteDraft, loadError } = params;

  return useCallback(
    () =>
      buildCmsHubContextData({
        sites,
        selectedSiteId,
        newSiteDraft,
        loadError,
      }) as SurfaceScopePayload,
    [sites, selectedSiteId, newSiteDraft, loadError],
  );
}
