"use client";

// features/marketing/seo/site-context/hooks.ts — query hooks over service.ts,
// plus the one tool call: `seo_site` action `context` ("What agents see").

import { useQuery } from "@tanstack/react-query";
import { useToolAction } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import {
  fetchBrandVoice,
  fetchExpertise,
  fetchSiteContextSettings,
  fetchRolePages,
  fetchSiteCompetitors,
  fetchSiteGoals,
} from "./service";

export const siteContextKeys = {
  all: ["marketing", "seo-site-context"] as const,
  goals: (brandId: string | null) => [...siteContextKeys.all, "goals", brandId] as const,
  pages: (siteId: string) => [...siteContextKeys.all, "pages", siteId] as const,
  competitors: (siteId: string) => [...siteContextKeys.all, "competitors", siteId] as const,
  voice: (brandId: string | null) => [...siteContextKeys.all, "voice", brandId] as const,
  roles: (orgId: string) => [...siteContextKeys.all, "roles", orgId] as const,
  expertise: (orgId: string | null, userId: string | null) =>
    [...siteContextKeys.all, "expertise", orgId, userId] as const,
};

export function useSiteGoals(brandId: string | null) {
  return useQuery({
    queryKey: siteContextKeys.goals(brandId),
    queryFn: () => fetchSiteGoals(brandId as string),
    enabled: !!brandId,
  });
}

export function useRolePages(siteId: string) {
  return useQuery({ queryKey: siteContextKeys.pages(siteId), queryFn: () => fetchRolePages(siteId) });
}

export function useSiteCompetitorFacts(siteId: string) {
  return useQuery({
    queryKey: siteContextKeys.competitors(siteId),
    queryFn: () => fetchSiteCompetitors(siteId),
  });
}

export function useBrandVoiceFact(brandId: string | null) {
  return useQuery({
    queryKey: siteContextKeys.voice(brandId),
    queryFn: () => fetchBrandVoice(brandId as string),
    enabled: !!brandId,
  });
}

export function useSiteContextSettings(organizationId: string) {
  return useQuery({
    queryKey: siteContextKeys.roles(organizationId),
    queryFn: () => fetchSiteContextSettings(organizationId),
  });
}

export function useOwnExpertise(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: siteContextKeys.expertise(organizationId, userId),
    queryFn: () =>
      fetchExpertise({ organizationId: organizationId as string, userId: userId as string }),
    enabled: !!organizationId && !!userId,
  });
}

export const SEO_SITE_TOOL = "seo_site";

/** `seo_site` `context` through the screen-run door — free, reads stored data only. */
export function useAgentContextView() {
  return useToolAction<ToolEnvelope<Record<string, unknown>>>(SEO_SITE_TOOL);
}
