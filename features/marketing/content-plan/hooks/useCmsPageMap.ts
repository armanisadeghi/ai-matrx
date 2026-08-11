"use client";

/**
 * features/marketing/content-plan/hooks/useCmsPageMap.ts
 *
 * WF-11: the plan workspace's CMS-page overlay. One cached read of the paired
 * CMS site's pages (GET /content-plan/sites/{id}/cms-pages via aidream — the
 * FE deliberately has no CMS Supabase client), keyed by plan node id for O(1)
 * badge lookups in tree/table rows and the NodePanel's linked-page card.
 *
 * `null` data = the plan site has no resolved CMS site yet — a normal state,
 * rendered as "no overlay", never an error. The prerequisite resolver must
 * provide the concrete CMS site id before this hook fetches; naming that id
 * lets a half-linked site read safely without relying on the CMS-side pairing.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";

import { planKeys } from "../data/hooks";
import { bridgeCmsPages, type CmsPageMap, type CmsPageMapEntry } from "../setup/bridge";

export function useCmsPageMap(siteId: string | null, cmsSite: string | null) {
  const dispatch = useAppDispatch();

  const query = useQuery<CmsPageMap | null>({
    queryKey: planKeys.cmsPages(siteId ?? "none"),
    enabled: Boolean(siteId && cmsSite),
    retry: false,
    staleTime: 60_000,
    queryFn: () => {
      if (!siteId || !cmsSite) {
        throw new Error("A plan site and CMS site are required for the page map.");
      }
      return bridgeCmsPages(dispatch, siteId, cmsSite);
    },
  });

  const pagesByNodeId = useMemo(() => {
    const map = new Map<string, CmsPageMapEntry>();
    for (const page of query.data?.pages ?? []) {
      if (page.planNodeId) map.set(page.planNodeId, page);
    }
    return map;
  }, [query.data]);

  return {
    /** null = unpaired (or not loaded yet) — no overlay. */
    map: query.data ?? null,
    pagesByNodeId,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
