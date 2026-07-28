"use client";

/**
 * app/(core)/marketing/content-plan/create-dense/_lib/hooks.ts
 *
 * TanStack Query hooks for the archetype console. The plan-side node list is
 * NOT refetched here — it is the SAME `usePlanNodes` cache the tree and the
 * pillar map read, so a commit shows up in every view at once.
 */
import { useQuery } from "@tanstack/react-query";

import {
  CmsAssetService,
  CmsComponentService,
  CmsSiteService,
} from "@/features/cms/services/cmsService";

import { resolveCmsLink, type CmsFacts } from "./readiness";
import { loadArchetypeLibrary } from "./service";

export const createDenseKeys = {
  all: ["content-plan", "archetype-console"] as const,
  library: (orgId: string) =>
    ["content-plan", "archetype-console", "library", orgId] as const,
  cms: (siteId: string) =>
    ["content-plan", "archetype-console", "cms", siteId] as const,
};

export function useArchetypeLibrary(organizationId: string | null) {
  return useQuery({
    queryKey: createDenseKeys.library(organizationId ?? "none"),
    queryFn: ({ signal }) => loadArchetypeLibrary(organizationId, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The CMS half of the readiness checklist. A site with no CMS counterpart is a
 * NORMAL result (`link.linked === false` plus the reason), not an error — only
 * a genuine transport/permission failure rejects.
 */
export function useCmsFacts(
  site: { id: string; domain: string | null; settings: unknown } | null,
) {
  return useQuery<CmsFacts>({
    queryKey: createDenseKeys.cms(site?.id ?? "none"),
    enabled: Boolean(site),
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async () => {
      const target = site as NonNullable<typeof site>;
      const cmsSites = await CmsSiteService.listSites();
      const link = resolveCmsLink(target, cmsSites);
      if (!link.linked || !link.cmsSiteId) {
        return { link, site: null, components: [], assets: [] };
      }
      const matched = cmsSites.find((entry) => entry.id === link.cmsSiteId) ?? null;
      const [components, assets] = await Promise.all([
        CmsComponentService.listComponents(link.cmsSiteId),
        CmsAssetService.listAssets(link.cmsSiteId),
      ]);
      return { link, site: matched, components, assets };
    },
  });
}
