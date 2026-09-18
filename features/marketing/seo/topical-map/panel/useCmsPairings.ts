"use client";

/**
 * Which live pages of the site in scope have a CMS record — so a page row in
 * the panel can open its CMS page (vision §2.3: "a page's plan/CMS record and
 * its live URL open in a new tab or window panel").
 *
 * A pairing is a CMS page whose `web_page_id` names the live page, on the CMS
 * site whose `web_site_id` names the site in scope. Both are the CMS feature's
 * own reads (`CmsSiteService.listSites`, `CmsPageService.listPages`) — nothing
 * here reaches a table. Without a site in scope there is no pairing to look
 * for, and the hook stays idle rather than listing every CMS site's pages.
 */

import { useQuery } from "@tanstack/react-query";

import { CmsPageService, CmsSiteService } from "@/features/cms/services/cmsService";

export interface CmsPairing {
  cmsSiteId: string;
  cmsPageId: string;
  title: string;
}

export function cmsPageHref(pairing: CmsPairing): string {
  return `/cms/${pairing.cmsSiteId}/pages/${pairing.cmsPageId}`;
}

export function useCmsPairings(siteId: string | null) {
  return useQuery({
    queryKey: ["topical-map", "cms-pairings", siteId],
    enabled: siteId !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<ReadonlyMap<string, CmsPairing>> => {
      const sites = await CmsSiteService.listSites();
      const cmsSite = sites.find((site) => site.web_site_id === siteId) ?? null;
      const pairings = new Map<string, CmsPairing>();
      if (!cmsSite) return pairings;
      const pages = await CmsPageService.listPages(cmsSite.id);
      for (const page of pages) {
        if (page.web_page_id) {
          pairings.set(page.web_page_id, {
            cmsSiteId: cmsSite.id,
            cmsPageId: page.id,
            title: page.title,
          });
        }
      }
      return pairings;
    },
  });
}
