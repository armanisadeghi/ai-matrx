"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

import { listSiteKeywordPerformance } from "./data/site-performance";

export function useSiteKeywordPerformance(
  siteId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: ["marketing", "site", siteId, "keyword-performance", state],
    queryFn: ({ signal }) => listSiteKeywordPerformance(siteId, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}
