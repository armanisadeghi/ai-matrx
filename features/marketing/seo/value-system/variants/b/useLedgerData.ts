"use client";

/**
 * Value Ledger (variant B) — react-query bindings over the shared value-system
 * data layer (../../data.ts — never modified here). One key family so a tier
 * ruling invalidates the summary, the docket, and the triage queue together.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "@/lib/toast";
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
import type { LedgerWindow } from "./lib";

const root = (siteId: string) => ["seo-value-ledger-b", siteId] as const;

export function useValueSummary(siteId: string, w: LedgerWindow) {
  return useQuery({
    queryKey: [...root(siteId), "summary", w.start, w.end],
    queryFn: ({ signal }) =>
      getValueSummary(siteId, w.start, w.end, w.compareStart, w.compareEnd, signal),
    staleTime: 60_000,
  });
}

export function useValueVocabulary(siteId: string, kind: "value_band" | "geo_band") {
  return useQuery({
    queryKey: [...root(siteId), "vocab", kind],
    queryFn: ({ signal }) => getValueVocabulary(siteId, kind, signal),
    staleTime: 5 * 60_000,
  });
}

export function useValueReview(
  siteId: string,
  w: LedgerWindow,
  query: ValueReviewQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: [...root(siteId), "review", w.start, w.end, query],
    queryFn: ({ signal }) => getValueReview(siteId, w.start, w.end, query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}

export function useValueRules(siteId: string) {
  return useQuery({
    queryKey: [...root(siteId), "rules"],
    queryFn: () => listValueRules(siteId),
    staleTime: 5 * 60_000,
  });
}

export function useGeoAreas(siteId: string) {
  return useQuery({
    queryKey: [...root(siteId), "geo-areas"],
    queryFn: () => listGeoAreas(siteId),
    staleTime: 5 * 60_000,
  });
}

export function useTopicWorth(siteId: string) {
  return useQuery({
    queryKey: [...root(siteId), "topic-worth"],
    queryFn: () => listSiteTopicValues(siteId),
    staleTime: 5 * 60_000,
  });
}

export interface RulingInput {
  keywordIds: string[];
  /** null clears the override back to computed/unvalued. */
  tier: string | null;
  notes?: string;
  /** For the toast copy. */
  tierLabel?: string;
}

export function useRuleKeywords(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ keywordIds, tier, notes }: RulingInput) =>
      setKeywordValue(siteId, keywordIds, tier, notes),
    onSuccess: (updated, vars) => {
      const n = updated.length;
      if (vars.tier === null) {
        toast.success(
          n === 1
            ? "Ruling cleared — back to the computed value."
            : `Cleared your ruling on ${n} keywords.`,
        );
      } else {
        toast.success(
          n === 1
            ? `Ruled as ${vars.tierLabel ?? vars.tier}.`
            : `Ruled ${n} keywords as ${vars.tierLabel ?? vars.tier}.`,
        );
      }
      void qc.invalidateQueries({ queryKey: root(siteId) });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error
          ? `Your ruling was not saved: ${error.message}`
          : "Your ruling was not saved. Nothing changed — try again.",
      );
    },
  });
}
