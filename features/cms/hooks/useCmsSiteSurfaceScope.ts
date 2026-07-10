"use client";

/**
 * Build the `matrx-user/cms-site` surface scope at trigger time.
 *
 * Mirrors `useCmsComponentSurfaceScope.ts`. Returns a
 * `() => SurfaceScopePayload` builder so the site dashboard / settings /
 * components-hub chrome reads the site-level cache (`useSiteContext()`) at
 * click time rather than baking a stale snapshot into state.
 */

import { useCallback } from "react";

import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { buildCmsSiteContextData } from "../agent-context/buildCmsSiteContextData";
import type { ClientComponent, ClientPageSummary, ClientSite } from "../types";

export interface UseCmsSiteSurfaceScopeParams {
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  selectedPageId?: string;
}

export function useCmsSiteSurfaceScope(
  params: UseCmsSiteSurfaceScopeParams,
): () => SurfaceScopePayload {
  const { site, pages, components, selectedPageId } = params;

  return useCallback(
    () =>
      buildCmsSiteContextData({
        site,
        pages,
        components,
        selectedPageId,
      }) as SurfaceScopePayload,
    [site, pages, components, selectedPageId],
  );
}
