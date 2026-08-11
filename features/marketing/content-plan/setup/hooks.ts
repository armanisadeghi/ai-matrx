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

import { resolveCmsLink, type CmsFacts, type CmsLink } from "./readiness";
import { loadArchetypeLibrary } from "./service";

type CmsLinkTarget = {
  id: string;
  domain: string | null;
  settings: unknown;
};

export const setupKeys = {
  all: ["content-plan", "setup"] as const,
  library: (orgId: string) => ["content-plan", "setup", "library", orgId] as const,
  cms: (siteId: string) => ["content-plan", "setup", "cms", siteId] as const,
  cmsLink: (siteId: string) => ["content-plan", "setup", "cms-link", siteId] as const,
};

export function useArchetypeLibrary(organizationId: string | null) {
  return useQuery({
    queryKey: setupKeys.library(organizationId ?? "none"),
    queryFn: ({ signal }) => loadArchetypeLibrary(organizationId, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Resolve the CMS counterpart from the site's recorded choice first, then the
 * existing domain match. CMS-only reads wait for this prerequisite instead of
 * probing the bridge with an unknown site.
 */
export async function loadCmsLink(site: CmsLinkTarget): Promise<CmsLink> {
  const cmsSites = await CmsSiteService.listSites();
  return resolveCmsLink(site, cmsSites);
}

/** An unlinked site is successful data, not a failed CMS-pages request. */
export function useCmsLink(site: CmsLinkTarget | null, enabled = true) {
  return useQuery<CmsLink>({
    queryKey: setupKeys.cmsLink(site?.id ?? "none"),
    enabled: Boolean(site) && enabled,
    staleTime: 60 * 1000,
    retry: false,
    queryFn: () => {
      if (!site) throw new Error("A site is required to resolve its CMS link.");
      return loadCmsLink(site);
    },
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
      if (!site) throw new Error("A site is required to load CMS facts.");
      const link = await loadCmsLink(site);
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
