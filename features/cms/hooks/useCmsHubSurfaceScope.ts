"use client";

/**
 * Build the `matrx-user/cms` (hub) surface scope at trigger time.
 *
 * Mirrors `useCmsSiteSurfaceScope.ts`. Returns a `() => SurfaceScopePayload`
 * builder so the sites list reads live state at click time.
 */

import { useCallback } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { buildCmsHubContextData } from "../agent-context/buildCmsHubContextData";
import type { ClientSite } from "../types";

export interface UseCmsHubSurfaceScopeParams {
  sites: readonly ClientSite[];
  selectedSiteId?: string;
}

export function useCmsHubSurfaceScope(
  params: UseCmsHubSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { sites, selectedSiteId } = params;

  return useCallback(
    () =>
      buildCmsHubContextData({ sites, selectedSiteId }) as SurfaceScopePayload,
    [sites, selectedSiteId],
  );
}
