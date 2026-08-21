"use client";

/**
 * Value Workbench D — react-query bindings over the shared data layer
 * (../../data.ts — the ONE data layer; never bypassed, never re-derived).
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  getValueReview,
  getValueSummary,
  getValueVocabulary,
  listGeoAreas,
  listSiteTopicValues,
  listValueRules,
  setKeywordValue,
} from "../../data";
import type { ValueReviewQuery } from "../../types";
import type { DateWindow } from "./lib";

const ROOT = "value-workbench-d";

export function useValueVocabulary(siteId: string, kind: "value_band" | "geo_band") {
  return useQuery({
    queryKey: [ROOT, "vocab", siteId, kind],
    queryFn: ({ signal }) => getValueVocabulary(siteId, kind, signal),
    staleTime: 60_000,
  });
}

export function useValueSummary(siteId: string, w: DateWindow) {
  return useQuery({
    queryKey: [ROOT, "summary", siteId, w.start, w.end],
    queryFn: ({ signal }) => getValueSummary(siteId, w.start, w.end, w.cmpStart, w.cmpEnd, signal),
    staleTime: 60_000,
  });
}

export function useValueReview(siteId: string, w: DateWindow, query: ValueReviewQuery) {
  return useQuery({
    queryKey: [ROOT, "review", siteId, w.start, w.end, query],
    queryFn: ({ signal }) => getValueReview(siteId, w.start, w.end, query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useValueRules(siteId: string) {
  return useQuery({
    queryKey: [ROOT, "rules", siteId],
    queryFn: () => listValueRules(siteId),
    staleTime: 60_000,
  });
}

export function useGeoAreas(siteId: string) {
  return useQuery({
    queryKey: [ROOT, "geo", siteId],
    queryFn: () => listGeoAreas(siteId),
    staleTime: 60_000,
  });
}

export function useSiteTopicValues(siteId: string) {
  return useQuery({
    queryKey: [ROOT, "topics", siteId],
    queryFn: () => listSiteTopicValues(siteId),
    staleTime: 60_000,
  });
}

/**
 * THE one write path. tier=null clears the override back to computed /
 * unvalued. Invalidates the listing AND the decomposition — a ruling moves
 * clicks between bands and the ledger must tell the truth immediately.
 */
export function useSetKeywordValue(siteId: string, bandLabel: (slug: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      keywordIds,
      tier,
      notes,
    }: {
      keywordIds: string[];
      tier: string | null;
      notes?: string;
    }) => setKeywordValue(siteId, keywordIds, tier, notes),
    onSuccess: (results, vars) => {
      const n = results.length;
      if (vars.tier === null) {
        toast.success(n === 1 ? "Override cleared — back to computed value" : `${n} overrides cleared`);
      } else {
        toast.success(
          n === 1
            ? `Keyword ruled ${bandLabel(vars.tier)}`
            : `${n} keywords ruled ${bandLabel(vars.tier)}`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: [ROOT, "review", siteId] });
      void queryClient.invalidateQueries({ queryKey: [ROOT, "summary", siteId] });
    },
    onError: (error) => {
      toast.error(`Could not save the ruling: ${extractErrorMessage(error)}`);
    },
  });
}
