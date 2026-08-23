/**
 * Dig Here react-query hooks — rule listing/CRUD over `seo.gsc_dig_rule`
 * and rule runs through the stateless `seo.gsc_perf_dig` RPC. Runs key on
 * the rule CONTENT hash, so editing a draft re-runs while an untouched rule
 * stays cached.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  adoptDigTemplate,
  createDigRule,
  deleteDigRule,
  evaluateConditionMatchers,
  listDigRuleStamps,
  removeDigRuleStamp,
  runGscDig,
  saveDigRuleStamp,
  listDigRules,
  updateDigRule,
  type DigRuleInput,
} from "@/features/marketing/search-console/data-dig";
import {
  digRuleContentKey,
  type GscDigRuleContent,
} from "@/features/marketing/search-console/lib/dig-rules";
import type {
  GscDigRuleRow,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

const STALE_MS = 5 * 60 * 1000;

export function useDigRules(siteId: string | null) {
  return useQuery({
    queryKey: ["marketing", "gsc", "dig-rules", siteId],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return listDigRules(siteId, signal);
    },
    enabled: !!siteId,
    staleTime: STALE_MS,
  });
}

export function useRunDig(
  siteId: string | null,
  periods: GscResolvedPeriods,
  content: GscDigRuleContent | null,
) {
  return useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "dig-run",
      siteId,
      periods.current.start,
      periods.current.end,
      periods.compare?.start ?? "",
      periods.compare?.end ?? "",
      content ? digRuleContentKey(content) : "",
    ],
    queryFn: ({ signal }) => {
      if (!siteId || !content) throw new Error("Nothing to run");
      return runGscDig(siteId, periods, content, signal);
    },
    enabled: !!siteId && !!content,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useDigRuleMutations(siteId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "dig-rules"],
    });

  const create = useMutation({
    mutationFn: (input: DigRuleInput) => createDigRule(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: (args: { ruleId: string; input: DigRuleInput }) =>
      updateDigRule(args.ruleId, args.input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) => deleteDigRule(ruleId),
    onSuccess: invalidate,
  });
  const adopt = useMutation({
    mutationFn: (args: {
      template: GscDigRuleRow;
      organizationId: string | null;
    }) => adoptDigTemplate(args.template, siteId, args.organizationId),
    onSuccess: invalidate,
  });

  return { create, update, remove, adopt };
}

/**
 * C5 — the values this site's dig rules fill. Keyed by rule so the editor's
 * "Saves matches as" strip and the rule rail's badges share one cache entry.
 */
export function useDigRuleStamps(
  siteId: string | null,
  ruleId: string | null,
) {
  return useQuery({
    queryKey: ["marketing", "gsc", "dig-rule-stamps", siteId, ruleId ?? "all"],
    queryFn: ({ signal }) => {
      if (!siteId) throw new Error("No site selected");
      return listDigRuleStamps(siteId, ruleId, signal);
    },
    enabled: !!siteId,
    staleTime: STALE_MS,
  });
}

/**
 * Save / remove / re-evaluate. Every one of them changes what keywords carry,
 * so they invalidate the stamp reads AND the dimension catalog (its counts and
 * as-of are the same facts seen from the other side).
 */
export function useDigStampMutations(siteId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "dig-rule-stamps"],
    });
    queryClient.invalidateQueries({
      queryKey: ["marketing", "gsc", "filter-dimension-catalog"],
    });
    queryClient.invalidateQueries({ queryKey: ["seo", "dimensions"] });
  };

  const save = useMutation({
    mutationFn: (args: { ruleId: string; valueId: string }) => {
      if (!siteId) throw new Error("No site selected");
      return saveDigRuleStamp(siteId, args.ruleId, args.valueId);
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (matcherId: string) => {
      if (!siteId) throw new Error("No site selected");
      return removeDigRuleStamp(siteId, matcherId);
    },
    onSuccess: invalidate,
  });
  const evaluate = useMutation({
    mutationFn: (scope: { matcherId?: string; dimensionId?: string }) => {
      if (!siteId) throw new Error("No site selected");
      return evaluateConditionMatchers(siteId, scope);
    },
    onSuccess: invalidate,
  });

  return { save, remove, evaluate };
}
