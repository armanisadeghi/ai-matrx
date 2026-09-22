"use client";

// features/marketing/seo/topical-map/useMapRegionsRun.ts
//
// The hook the pages workspace's "map the regions" control launches. It is a
// DURABLE SEO command (`useSeoCommandRun` → `lib/durable-run/useDurableRun`)
// like its two siblings, and for the same reason: a site with tens of thousands
// of pages takes minutes, the stages stream, and a reload rejoins the run
// instead of losing it.
//
// 🚨 IT SPENDS NOTHING. This pass makes no model calls at all — a place is read
// out of a page's own address by subtracting the words the map already uses for
// its subjects. So `live` carries a label for the run window but the interesting
// output is the RESULT, not a token stream, and `dryRun` is genuinely free:
// offer the rehearsal before `retireGeographyTopics`, never after.
//
// Everything about the WIRE lives in `./map-regions`; this file is transport and
// cache invalidation only. There is no screen here — lane F owns every word.

import { useQueryClient } from "@tanstack/react-query";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

import { siteMappingReaderKeys, topicalMapKeys } from "./hooks";
import {
  MAP_REGIONS_FINAL_KIND,
  MAP_REGIONS_PATH,
  MAP_REGIONS_STAGES,
  mapRegionsBody,
  parseMapRegionsResult,
  type MapRegionsInput,
  type MapRegionsRunResult,
} from "./map-regions";

export interface UseMapRegionsRunOptions {
  /** The site whose pages get their region. Fills `{site_id}` in the command path. */
  siteId: string | null;
  /** The map this site uses — what the finished run invalidates (the result also carries it). */
  mapId?: string | null;
  /** Narrows the request context, exactly as every other SEO command does. */
  organizationId?: string | null;
  /** Called once with a validated terminal result, on a stream OR a rejoin. */
  onResult?: (result: MapRegionsRunResult) => void;
}

export interface MapRegionsRunHandle
  extends ReturnType<typeof useSeoCommandRun<MapRegionsRunResult>> {
  /**
   * Start a pass. The body is built and validated by `mapRegionsBody`, so a
   * field foreign to this endpoint — or geography slugs named without asking
   * for the retirement, which the server would silently ignore — throws HERE.
   */
  run: (input?: MapRegionsInput) => Promise<void>;
}

export function useMapRegionsRun(options: UseMapRegionsRunOptions): MapRegionsRunHandle {
  const { siteId, mapId, organizationId, onResult } = options;
  const queryClient = useQueryClient();

  const command = useSeoCommandRun<MapRegionsRunResult>({
    key: `topical-map.map-regions.${siteId ?? "none"}`,
    path: MAP_REGIONS_PATH,
    finalKind: MAP_REGIONS_FINAL_KIND,
    stageLabels: MAP_REGIONS_STAGES,
    parseResult: parseMapRegionsResult,
    onResult: (result) => {
      // The pass wrote facet VALUES and page facet assignments, and — when the
      // retirement was asked for — retired topics and moved their pages. Every
      // read under the map is stale, and so is the site's mapping ledger: a
      // page recovered off a retired geography branch may now sit on no topic
      // at all, which is exactly what `list_pages_without_topic` reports.
      const written = result.map_id || mapId;
      if (written) {
        void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(written) });
      }
      for (const queryKey of siteMappingReaderKeys(result.site_id || (siteId ?? ""))) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onResult?.(result);
    },
    live: { label: "Map regions" },
    ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
  });

  const run = async (input: MapRegionsInput = {}): Promise<void> => {
    if (!siteId) {
      throw new Error(
        "Regions are derived and bound FOR a site and no site was given. Pick the site " +
          "first — the pages this pass reads belong to a site, not to the map.",
      );
    }
    const body = mapRegionsBody(input);
    await command.launch(body as unknown as Record<string, unknown>, undefined, {
      pathParams: { site_id: siteId },
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
      memo: {
        site_id: siteId,
        ...(mapId ? { map_id: mapId } : {}),
        ...(input.dryRun ? { dry_run: "true" } : {}),
        // A run that RETIRES topics is not the same run as one that binds
        // pages, and a screen that comes back after a reload must be able to
        // say which one is in flight.
        ...(input.retireGeographyTopics ? { retire_geography_topics: "true" } : {}),
      },
    });
  };

  return { ...command, run };
}
