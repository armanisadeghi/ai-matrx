"use client";

/**
 * TanStack Query hooks for the Blueprint Bench. Node reads/mutations reuse the
 * canonical content-plan hooks (`features/marketing/content-plan/data/hooks`) —
 * nothing here forks the plan cache; the commit invalidates the SAME
 * `planKeys.nodes(siteId)` entry the tree and pillar map read.
 */
import { useQuery } from "@tanstack/react-query";

import type { MarketingSite } from "@/features/marketing/types";

import { loadArchetypeLibrary, loadCmsReadiness } from "./data";

export const benchKeys = {
  library: (orgId: string) => ["content-plan", "archetype-library", orgId] as const,
  cms: (siteId: string) => ["content-plan", "cms-readiness", siteId] as const,
};

export function useArchetypeLibrary(organizationId: string | null) {
  return useQuery({
    queryKey: benchKeys.library(organizationId ?? "none"),
    queryFn: ({ signal }) => loadArchetypeLibrary(organizationId, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The CMS half of the readiness ledger. It crosses to a second Supabase project
 * through the existing `/api/cms/*` seam, so it is slower and independently
 * fallible — kept in its own query so a CMS outage degrades ONE panel instead of
 * blanking the bench.
 */
export function useCmsReadiness(site: MarketingSite | null) {
  return useQuery({
    queryKey: benchKeys.cms(site?.id ?? "none"),
    queryFn: ({ signal }) => loadCmsReadiness(site as MarketingSite, signal),
    enabled: Boolean(site),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
