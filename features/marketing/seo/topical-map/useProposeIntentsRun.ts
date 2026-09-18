"use client";

// features/marketing/seo/topical-map/useProposeIntentsRun.ts
//
// The hook the pages workspace's "propose the destinations" control launches.
// It is a DURABLE SEO command (`useSeoCommandRun` → `lib/durable-run/useDurableRun`),
// not a fetch, because proposing a site's destinations is minutes of paid agent
// work: claimed on the server before the first paid call, streamed, floated in
// the canonical `LiveRunWindow`, and rejoinable after a reload.
//
// 🚨 NOTHING THIS RUN DOES ACTS. Every intent comes back `proposed`, for a
// person to review through `intent_review_mode`. A screen that reports this run
// as "pages redirected" is describing something that did not happen.
//
// Everything about the WIRE lives in `./map-intents`; this file is transport
// and cache invalidation only. There is no screen here — lane F owns every word.

import { useQueryClient } from "@tanstack/react-query";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import type { paths } from "@/types/python-generated/api-types";

import { siteMappingReaderKeys, topicalMapKeys } from "./hooks";
import {
  PROPOSE_INTENTS_FINAL_KIND,
  PROPOSE_INTENTS_PATH,
  PROPOSE_INTENTS_STAGES,
  parseProposeIntentsResult,
  proposeIntentsBody,
  type ProposeIntentsInput,
  type ProposeIntentsResult,
} from "./map-intents";

export interface UseProposeIntentsRunOptions {
  /** The site whose mapped pages are judged. Fills `{site_id}` in the command path. */
  siteId: string | null;
  /** The map this site uses — what the finished run invalidates (the result also carries it). */
  mapId?: string | null;
  /** Narrows the request context, exactly as every other SEO command does. */
  organizationId?: string | null;
  /** Called once with a validated terminal result, on a stream OR a rejoin. */
  onResult?: (result: ProposeIntentsResult) => void;
}

export interface ProposeIntentsRunHandle
  extends ReturnType<typeof useSeoCommandRun<ProposeIntentsResult>> {
  /**
   * Start a pass. The body is built and validated by `proposeIntentsBody`, so a
   * field foreign to this endpoint, or a nonsense limit, throws HERE — before a
   * paid call — instead of coming back as a 422 with a pydantic path in it.
   */
  run: (input?: ProposeIntentsInput) => Promise<void>;
}

export function useProposeIntentsRun(
  options: UseProposeIntentsRunOptions,
): ProposeIntentsRunHandle {
  const { siteId, mapId, organizationId, onResult } = options;
  const queryClient = useQueryClient();

  const command = useSeoCommandRun<ProposeIntentsResult>({
    key: `topical-map.propose-intents.${siteId ?? "none"}`,
    // ⚠️ CAST, not a `satisfies`: the generated contract does not carry this
    // path yet (see `map-intents.ts`).
    path: PROPOSE_INTENTS_PATH as unknown as keyof paths,
    finalKind: PROPOSE_INTENTS_FINAL_KIND,
    stageLabels: PROPOSE_INTENTS_STAGES,
    parseResult: parseProposeIntentsResult,
    onResult: (result) => {
      // The pass wrote INTENT edges (proposed), so `list_page_intents` and
      // every other read under the map is stale, and so is the site's ledger.
      const written = result.map_id || mapId;
      if (written) {
        void queryClient.invalidateQueries({ queryKey: topicalMapKeys.map(written) });
      }
      for (const queryKey of siteMappingReaderKeys(result.site_id || (siteId ?? ""))) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onResult?.(result);
    },
    live: { label: "Page destinations" },
    ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
  });

  const run = async (input: ProposeIntentsInput = {}): Promise<void> => {
    if (!siteId) {
      throw new Error(
        "Destinations are proposed FOR a site and no site was given. Pick the site " +
          "first — the ledger this run works belongs to a site, not to the map.",
      );
    }
    const body = proposeIntentsBody(input);
    await command.launch(body as unknown as Record<string, unknown>, undefined, {
      pathParams: { site_id: siteId },
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
      memo: {
        site_id: siteId,
        ...(mapId ? { map_id: mapId } : {}),
        ...(input.dryRun ? { dry_run: "true" } : {}),
        // Joined, not an array: a memo carries strings. It is read to SAY
        // which topics a rejoined run is working, never to rebuild the body.
        ...(input.topicSlugs && input.topicSlugs.length > 0
          ? { topic_slugs: input.topicSlugs.join(", ") }
          : {}),
      },
    });
  };

  return { ...command, run };
}
