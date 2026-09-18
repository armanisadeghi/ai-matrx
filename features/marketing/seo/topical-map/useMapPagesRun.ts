"use client";

// features/marketing/seo/topical-map/useMapPagesRun.ts
//
// The hook the pages workspace's "map the pages" control launches. It is a
// DURABLE SEO command (`useSeoCommandRun` → `lib/durable-run/useDurableRun`),
// not a fetch, because mapping a site is many minutes of paid agent work: the
// run is claimed on the server before the first paid call, its stages stream,
// it floats in the canonical `LiveRunWindow` (THE FLOATING LAW — a spinner over
// a working agent is the named defect), and closing the tab or reloading
// rejoins it instead of losing it. Two simultaneous presses on one site resolve
// to ONE claimed row and the loser rejoins the live stream rather than paying
// for a second run.
//
// Everything about the WIRE lives in `./map-pages`; this file is transport and
// cache invalidation only. There is no screen here — lane F owns every word.

import { useQueryClient } from "@tanstack/react-query";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import type { paths } from "@/types/python-generated/api-types";

import { siteMappingReaderKeys, topicalMapKeys } from "./hooks";
import {
  MAP_PAGES_FINAL_KIND,
  MAP_PAGES_PATH,
  MAP_PAGES_STAGES,
  mapPagesBody,
  parseMapPagesResult,
  type MapPagesInput,
  type MapPagesResult,
} from "./map-pages";

export interface UseMapPagesRunOptions {
  /**
   * The site this run maps. It fills the `{site_id}` placeholder in the command
   * path: without it the literal placeholder reaches the server as the id and
   * dies as a uuid cast error (the 2026-09-14 lesson every durable command path
   * carries).
   */
  siteId: string | null;
  /**
   * The map this site uses. It is NOT sent — the server resolves it from the
   * site — but the run's writes land under it, so it is what the finished run
   * invalidates. Pass it when the surface knows it; the result carries its own
   * `map_id` either way and that is what is actually used.
   */
  mapId?: string | null;
  /** Narrows the request context, exactly as every other SEO command does. */
  organizationId?: string | null;
  /** Called once with a validated terminal result, on a stream OR a rejoin. */
  onResult?: (result: MapPagesResult) => void;
}

export interface MapPagesRunHandle
  extends ReturnType<typeof useSeoCommandRun<MapPagesResult>> {
  /**
   * Start a pass. The body is built and validated by `mapPagesBody`, so a field
   * foreign to this endpoint, or a nonsense limit, throws HERE — before a paid
   * call — instead of coming back as a 422 with a pydantic path in it.
   */
  run: (input?: MapPagesInput) => Promise<void>;
}

export function useMapPagesRun(options: UseMapPagesRunOptions): MapPagesRunHandle {
  const { siteId, mapId, organizationId, onResult } = options;
  const queryClient = useQueryClient();

  const command = useSeoCommandRun<MapPagesResult>({
    // Per-site, so two sites' runs can never rejoin onto each other's screen.
    key: `topical-map.map-pages.${siteId ?? "none"}`,
    // ⚠️ CAST, not a `satisfies`: the generated contract does not carry this
    // path yet (see `map-pages.ts`). Drop the cast the moment
    // `pnpm sync-types` has run — `run-clients.test.ts` fails until
    // then, by design.
    path: MAP_PAGES_PATH as unknown as keyof paths,
    finalKind: MAP_PAGES_FINAL_KIND,
    stageLabels: MAP_PAGES_STAGES,
    parseResult: parseMapPagesResult,
    onResult: (result) => {
      // The pass WROTE coverage edges, so every read under that map is stale
      // the moment it lands — even a dry run touched the LEDGER (claims,
      // attempts, `no_topic` suggestions), which is what the status readers
      // below show.
      const written = result.map_id || mapId;
      if (written) {
        void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(written) });
      }
      for (const queryKey of siteMappingReaderKeys(result.site_id || (siteId ?? ""))) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onResult?.(result);
    },
    // The mapper is an agent whose OUTPUT is the point, so the run renders
    // token by token through the canonical pipeline rather than behind a stage
    // line over an invisible model.
    live: { label: "Page mapper" },
    ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
  });

  const run = async (input: MapPagesInput = {}): Promise<void> => {
    if (!siteId) {
      throw new Error(
        "Pages are mapped FOR a site and no site was given. Pick the site first — the " +
          "ledger this run works belongs to a site, not to the map.",
      );
    }
    const body = mapPagesBody(input);
    await command.launch(body as unknown as Record<string, unknown>, undefined, {
      pathParams: { site_id: siteId },
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
      // What the answer cannot rebuild after a reload: which site and map this
      // run was about, and whether it was a rehearsal (see `DurableRunState.memo`).
      memo: {
        site_id: siteId,
        ...(mapId ? { map_id: mapId } : {}),
        // A memo is a `Record<string, string>` — the few strings the next
        // screen needs and the answer cannot rebuild, not a second copy of the
        // request body.
        ...(input.dryRun ? { dry_run: "true" } : {}),
      },
    });
  };

  return { ...command, run };
}
