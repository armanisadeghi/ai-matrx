"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import type { BacklinkLensKey } from "@/features/marketing/components/backlinks/lib/vocab";
import {
  getBacklinkTrend,
  getBacklinkWorkspace,
  listAllAnchors,
  listDimensionRows,
  listLatestBacklinks,
  listReferringDomainProfiles,
  type BacklinkDimensionKind,
} from "@/features/marketing/data/backlinks-queries";
import { marketingKeys } from "@/features/marketing/data/hooks";

export const backlinkKeys = {
  workspace: (siteId: string) =>
    [...marketingKeys.site(siteId), "backlinks", "workspace"] as const,
  observations: (
    siteId: string,
    state: MatrxDataTableQueryState,
    lens: BacklinkLensKey | null,
  ) =>
    [
      ...marketingKeys.site(siteId),
      "backlinks",
      "observations",
      lens ?? "all",
      state,
    ] as const,
  dimension: (
    siteId: string,
    kind: BacklinkDimensionKind,
    state: MatrxDataTableQueryState,
  ) =>
    [
      ...marketingKeys.site(siteId),
      "backlinks",
      "dimension",
      kind,
      state,
    ] as const,
  anchorsFull: (siteId: string) =>
    [...marketingKeys.site(siteId), "backlinks", "anchors-full"] as const,
  trend: (siteId: string) =>
    [...marketingKeys.site(siteId), "backlinks", "trend"] as const,
  domainProfiles: (siteId: string, state: MatrxDataTableQueryState) =>
    [
      ...marketingKeys.site(siteId),
      "backlinks",
      "domain-profiles",
      state,
    ] as const,
};

export function useBacklinkWorkspace(siteId: string) {
  return useQuery({
    queryKey: backlinkKeys.workspace(siteId),
    queryFn: ({ signal }) => getBacklinkWorkspace(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useReferringDomainProfiles(
  siteId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: backlinkKeys.domainProfiles(siteId, state),
    queryFn: ({ signal }) => listReferringDomainProfiles(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useBacklinkTrend(siteId: string) {
  return useQuery({
    queryKey: backlinkKeys.trend(siteId),
    queryFn: ({ signal }) => getBacklinkTrend(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useLatestBacklinks(
  siteId: string,
  state: MatrxDataTableQueryState,
  lens: BacklinkLensKey | null = null,
) {
  return useQuery({
    queryKey: backlinkKeys.observations(siteId, state, lens),
    queryFn: ({ signal }) =>
      listLatestBacklinks(siteId, state, lens ? { lens } : undefined, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useBacklinkDimensionRows(
  siteId: string,
  kind: BacklinkDimensionKind,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: backlinkKeys.dimension(siteId, kind, state),
    queryFn: ({ signal }) => listDimensionRows(siteId, kind, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

/** Full anchor set for the anchor-profile classifier (client-side analysis). */
export function useBacklinkAnchorsFull(siteId: string) {
  return useQuery({
    queryKey: backlinkKeys.anchorsFull(siteId),
    queryFn: ({ signal }) => listAllAnchors(siteId, signal),
    enabled: Boolean(siteId),
    staleTime: 5 * 60 * 1000,
  });
}
