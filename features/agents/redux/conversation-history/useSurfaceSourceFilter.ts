"use client";

/**
 * useSurfaceSourceFilter — resolves the active source filter (which
 * `source_app` / `source_feature` provenance to show) for a given surface.
 *
 * Precedence: the user's stored per-surface override
 * (`userPreferences.conversationFilters.surfaces[surfaceId]`) wins; otherwise
 * the registry default (`SURFACE_DEFAULTS`) applies. The returned shape is the
 * `include*` triple consumed directly by `fetchConversationHistory` /
 * `setScopeSourceFilter`.
 *
 * This is the single resolution point shared by every conversation-history
 * surface (chat sidebar, code sidebar, history window) so the "which surfaces
 * do I show by default" logic lives in exactly one place.
 */

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  resolveSurfaceFilter,
  type ResolvedSourceFilter,
} from "./source-registry";

export function useSurfaceSourceFilter(
  surfaceId: string | undefined,
): ResolvedSourceFilter {
  const surfaces = useAppSelector(
    (state) => state.userPreferences.conversationFilters?.surfaces,
  );
  return useMemo(() => {
    if (!surfaceId) {
      return {
        includeSourceApps: [],
        includeSourceFeatures: [],
        includeEmptySource: false,
      };
    }
    const pref = surfaces?.[surfaceId];
    return resolveSurfaceFilter(surfaceId, pref ?? null);
  }, [surfaceId, surfaces]);
}
