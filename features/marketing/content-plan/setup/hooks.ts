"use client";

/**
 * features/marketing/content-plan/setup/hooks.ts
 *
 * TanStack Query hooks for the Site Setup view. The plan-side node list is NOT
 * refetched here — it is the SAME `usePlanNodes` cache the tree, table and map
 * read, so a commit shows up in every view at once.
 */
import { useQuery } from "@tanstack/react-query";

import {
  CmsAssetService,
  CmsComponentService,
  CmsSiteService,
} from "@/features/cms/services/cmsService";

import { resolveCmsLink, type CmsFacts } from "./readiness";
import { loadArchetypeLibrary } from "./service";

export const setupKeys = {
  all: ["content-plan", "setup"] as const,
  library: (orgId: string) => ["content-plan", "setup", "library", orgId] as const,
  cms: (siteId: string) => ["content-plan", "setup", "cms", siteId] as const,
};

export function useArchetypeLibrary(organizationId: string | null) {
  return useQuery({
    queryKey: setupKeys.library(organizationId ?? "none"),
    queryFn: ({ signal }) => loadArchetypeLibrary(organizationId, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The CMS half of the readiness checklist. A site with no CMS counterpart is a
 * NORMAL result (`link.linked === false` plus the reason), not an error — only
 * a genuine transport/permission failure rejects.
 *
 * `listSites` returns SUMMARY rows (no `theme_config`, no `navigation`), so the
 * matched site is re-read in full via `getSite`. Reading those fields off a
 * list row reported "0 nav entries, no theme" for sites that have both.
 */
export function useCmsFacts(
  site: { id: string; domain: string | null; settings: unknown } | null,
) {
  return useQuery<CmsFacts>({
    queryKey: setupKeys.cms(site?.id ?? "none"),
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
      const [full, components, assets] = await Promise.all([
        CmsSiteService.getSite(link.cmsSiteId),
        CmsComponentService.listComponents(link.cmsSiteId),
        CmsAssetService.listAssets(link.cmsSiteId),
      ]);
      return { link, site: full, components, assets };
    },
  });
}
