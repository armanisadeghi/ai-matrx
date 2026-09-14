"use client";

/**
 * features/marketing/strategy/hooks.ts — reads, the ruling, and the DURABLE
 * generate run for the brand strategy / site brief (see ./data.ts).
 *
 * Generation is a multi-minute paid run, so it is a durable SEO command
 * (`useSeoCommandRun`): claimed on the server before the first paid call,
 * streamed into the floating live window, and rejoined after a reload. A
 * spinner over it would be THE FLOATING LAW's named defect.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  loadStrategy,
  loadStrategyHistory,
  parseStrategyBrief,
  ruleOnStrategy,
  type StrategyBrief,
  type StrategyScope,
} from "./data";

export const strategyKeys = {
  all: ["marketing", "strategy"] as const,
  brief: (scope: StrategyScope, id: string) =>
    ["marketing", "strategy", scope, id] as const,
  history: (scope: StrategyScope, id: string) =>
    ["marketing", "strategy", scope, id, "history"] as const,
};

export function useStrategyBrief(
  scope: StrategyScope,
  id: string | null,
  organizationId: string,
) {
  const dispatch = useAppDispatch();
  return useQuery<StrategyBrief | null>({
    queryKey: strategyKeys.brief(scope, id ?? "none"),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: false,
    queryFn: () => loadStrategy(dispatch, scope, id as string, organizationId),
  });
}

export function useStrategyHistory(
  scope: StrategyScope,
  id: string | null,
  organizationId: string,
  enabled = true,
) {
  const dispatch = useAppDispatch();
  return useQuery<StrategyBrief[]>({
    queryKey: strategyKeys.history(scope, id ?? "none"),
    enabled: Boolean(id) && enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: () =>
      loadStrategyHistory(dispatch, scope, id as string, organizationId),
  });
}

export function useStrategyRuling(
  scope: StrategyScope,
  id: string | null,
  organizationId: string,
) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruling: { guidance: string; briefMarkdown?: string }) => {
      if (!id) throw new Error("Nothing to rule on yet.");
      return ruleOnStrategy(dispatch, scope, id, organizationId, ruling);
    },
    onSuccess: async (brief) => {
      queryClient.setQueryData(strategyKeys.brief(scope, id ?? "none"), brief);
      await queryClient.invalidateQueries({ queryKey: strategyKeys.all });
      toast.success("Your correction is now the standing guidance for every agent.");
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });
}

/** The server's own milestones, in the reader's words. Never invented stages. */
const STRATEGY_STAGES: Record<string, string> = {
  "seo.strategy_reading_crawl": "Reading what is on the website today…",
  "seo.strategy_reading_gsc": "Reading Search Console…",
  "seo.strategy_reading_keywords": "Reading the keyword library…",
  "seo.strategy_reading_research": "Reading the research…",
  "seo.strategy_writing": "Writing the brief…",
  "seo.strategy_completed": "Brief written — waiting for your review",
};

const FINAL_KIND = "seo.strategy_brief_result";

/**
 * Regenerate (or first-generate) the brief. Supersedes the current version
 * and carries the owner's corrections forward — the caller confirms that
 * consequence before launching.
 */
export function useGenerateStrategy(
  scope: StrategyScope,
  id: string | null,
  organizationId: string | null,
) {
  const queryClient = useQueryClient();
  const command = useSeoCommandRun<StrategyBrief>({
    key: `strategy.${scope}.${id ?? "none"}`,
    path:
      scope === "brand"
        ? "/seo/brands/{brand_id}/strategy/generate"
        : "/seo/sites/{site_id}/strategy/generate",
    finalKind: FINAL_KIND,
    stageLabels: STRATEGY_STAGES,
    parseResult: (raw) => {
      const body =
        raw && typeof raw === "object" && "brief" in (raw as object)
          ? (raw as { brief: unknown }).brief
          : raw;
      return parseStrategyBrief(body);
    },
    onResult: () => {
      void queryClient.invalidateQueries({ queryKey: strategyKeys.all });
    },
    // The brief row IS the answer and the screen reads it; a finished run must
    // not re-float its "Done" window on every later visit.
    keepFinished: false,
    ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
    live: {
      label: scope === "brand" ? "Brand strategy" : "Site brief",
    },
  });
  // The command path carries a `{brand_id}` / `{site_id}` placeholder; every
  // launch (and every retry) must fill it — a literal placeholder reaches the
  // server as the id and dies as a uuid cast error.
  const pathParams: Record<string, string> =
    scope === "brand" ? { brand_id: id ?? "" } : { site_id: id ?? "" };
  const launch = (body: Record<string, unknown> = {}) =>
    command.launch(body, undefined, {
      pathParams,
      ...(organizationId ? { scopeOverrides: { organization_id: organizationId } } : {}),
    });
  return { ...command, launch };
}
