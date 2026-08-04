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
  listDigRules,
  runGscDig,
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
