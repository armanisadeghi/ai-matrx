"use client";

/**
 * app/(core)/marketing/content-plan/create-refine/_lib/hooks.ts
 *
 * TanStack Query hooks for the Site Setup view. The plan-node reads are the
 * feature's existing hooks (`usePlanNodes`) — only the archetype library is new,
 * so there is exactly one new query key here.
 */
import { useQuery } from "@tanstack/react-query";

import { loadArchetypeLibrary } from "./data";

export const setupKeys = {
  all: ["content-plan", "archetypes"] as const,
  library: (orgId: string) => ["content-plan", "archetypes", orgId] as const,
};

export function useArchetypeLibrary(organizationId: string | null) {
  return useQuery({
    queryKey: setupKeys.library(organizationId ?? "none"),
    queryFn: ({ signal }) => loadArchetypeLibrary(organizationId, signal),
    staleTime: 5 * 60 * 1000,
  });
}
