"use client";

/**
 * features/marketing/content-plan/hooks/useSitePipeline.ts
 *
 * The SITE-level pipeline — the per-page rail's eight steps (Research → Plan →
 * SEO strategy → Page content → Design & components → Development → Draft →
 * Live) answered for the whole site. One cached read of
 * `GET /content-plan/sites/{id}/pipeline`; the server derives every stage from
 * live rows (nodes, step states, the SEO-plan store, the CMS shell and page
 * rows) at read time — nothing is stamped, so what it says is what exists.
 */
import { useQuery } from "@tanstack/react-query";

import { useAppDispatch } from "@/lib/redux/hooks";

import { planKeys } from "../data/hooks";
import { fetchSitePipeline, type SitePipelineData } from "../setup/bridge";

export function useSitePipeline(siteId: string | null) {
  const dispatch = useAppDispatch();

  const query = useQuery<SitePipelineData>({
    queryKey: planKeys.sitePipeline(siteId ?? "none"),
    enabled: Boolean(siteId),
    retry: false,
    staleTime: 60_000,
    queryFn: () => {
      if (!siteId) throw new Error("A plan site is required for the pipeline.");
      return fetchSitePipeline(dispatch, siteId);
    },
  });

  return {
    /** null until loaded — the strip renders nothing rather than lying zeros. */
    pipeline: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
