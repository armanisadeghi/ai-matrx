"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  getBacklinkTrend,
  getBacklinkWorkspace,
  listLatestBacklinks,
} from "@/features/marketing/data/backlinks-queries";
import { marketingKeys } from "@/features/marketing/data/hooks";

export const backlinkKeys = {
  workspace: (siteId: string) =>
    [...marketingKeys.site(siteId), "backlinks", "workspace"] as const,
  observations: (siteId: string, state: MatrxDataTableQueryState) =>
    [
      ...marketingKeys.site(siteId),
      "backlinks",
      "observations",
      state,
    ] as const,
  trend: (siteId: string) =>
    [...marketingKeys.site(siteId), "backlinks", "trend"] as const,
};

export function useBacklinkWorkspace(siteId: string) {
  return useQuery({
    queryKey: backlinkKeys.workspace(siteId),
    queryFn: ({ signal }) => getBacklinkWorkspace(siteId, signal),
    enabled: Boolean(siteId),
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
) {
  return useQuery({
    queryKey: backlinkKeys.observations(siteId, state),
    queryFn: ({ signal }) => listLatestBacklinks(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}
