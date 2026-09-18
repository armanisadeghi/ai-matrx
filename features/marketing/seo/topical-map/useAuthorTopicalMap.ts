"use client";

// features/marketing/seo/topical-map/useAuthorTopicalMap.ts
//
// The hook U4's "start a map" screen launches. It is a DURABLE SEO command
// (`useSeoCommandRun` → `lib/durable-run/useDurableRun`), not a fetch, because
// authoring a map is minutes of paid agent work: the run is claimed on the
// server before the first paid call, its stages stream, it floats in the
// canonical `LiveRunWindow` (THE FLOATING LAW — a spinner over a working agent
// is the named defect), and closing the tab or reloading rejoins it instead of
// losing it. Two simultaneous presses on the same brand and source resolve to
// ONE claimed row and the loser rejoins the live stream rather than paying for
// a second run.
//
// Everything about the WIRE lives in `./map-author`; this file is transport
// and cache invalidation only. There is no screen here — U4 owns every word.

import { useQueryClient } from "@tanstack/react-query";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

import { topicalMapKeys } from "./hooks";
import {
  authorTopicalMapBody,
  MAP_AUTHOR_FINAL_KIND,
  MAP_AUTHOR_PATH,
  MAP_AUTHOR_STAGES,
  parseAuthorTopicalMapResult,
  type AuthorTopicalMapInput,
  type AuthorTopicalMapResult,
} from "./map-author";

export interface UseAuthorTopicalMapOptions {
  /**
   * The brand this run authors for. It fills the `{brand_id}` placeholder in
   * the command path: without it the literal placeholder reaches the server as
   * the id and dies as a uuid cast error (the 2026-09-14 lesson every durable
   * command path carries).
   */
  brandId: string | null;
  /** Narrows the request context, exactly as every other SEO command does. */
  organizationId?: string | null;
  /** Called once with a validated terminal result, on a stream OR a rejoin. */
  onResult?: (result: AuthorTopicalMapResult) => void;
}

export interface AuthorTopicalMapHandle
  extends ReturnType<typeof useSeoCommandRun<AuthorTopicalMapResult>> {
  /**
   * Start a run for one chosen source. The body is built and validated by
   * `authorTopicalMapBody`, so a missing required field throws HERE, before a
   * paid call, instead of coming back as a 422 with a pydantic path in it.
   */
  author: (input: Omit<AuthorTopicalMapInput, "brandId">) => Promise<void>;
}

export function useAuthorTopicalMap(
  options: UseAuthorTopicalMapOptions,
): AuthorTopicalMapHandle {
  const { brandId, organizationId, onResult } = options;
  const queryClient = useQueryClient();

  const command = useSeoCommandRun<AuthorTopicalMapResult>({
    // Per-brand, so two brands' runs can never rejoin onto each other's screen.
    key: `topical-map.author.${brandId ?? "none"}`,
    path: MAP_AUTHOR_PATH,
    finalKind: MAP_AUTHOR_FINAL_KIND,
    stageLabels: MAP_AUTHOR_STAGES,
    parseResult: parseAuthorTopicalMapResult,
    onResult: (result) => {
      // The run WROTE topics (proposed or active), so every read under that map
      // is stale the moment it lands.
      if (result.map_id) {
        void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(result.map_id) });
      }
      // A run with no `map_id` given created a draft map for this brand, so the
      // map LIST is stale too.
      void queryClient.invalidateQueries({ queryKey: topicalMapKeys.root });
      onResult?.(result);
    },
    // The author is an agent whose OUTPUT is the point, so the run renders
    // token by token through the canonical pipeline rather than behind a stage
    // line over an invisible model.
    live: { label: "Topical map author" },
    ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
  });

  const author = async (input: Omit<AuthorTopicalMapInput, "brandId">): Promise<void> => {
    if (!brandId) {
      throw new Error(
        "A map is authored FOR a brand and no brand was given. Pick the brand first — " +
          "a map is owned by a brand, never by a site.",
      );
    }
    const body = authorTopicalMapBody({ ...input, brandId });
    await command.launch(body as unknown as Record<string, unknown>, undefined, {
      pathParams: { brand_id: brandId },
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
      // What the answer cannot rebuild after a reload: which source and which
      // map this run was about, so the screen that comes back can still say
      // what is running (see `DurableRunState.memo`).
      memo: {
        source_kind: input.sourceKind,
        ...(input.mapId ? { map_id: input.mapId } : {}),
      },
    });
  };

  return { ...command, author };
}
