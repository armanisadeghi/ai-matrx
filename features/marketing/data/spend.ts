"use client";

/**
 * SEO provider spend rollup (M-9 / WS-7 UI tranche) — reads
 * `GET /seo/spend/summary`, a fast ordinary-JSON read (never streamed, same
 * "status panel, not a command" ruling `schedule-status` follows) backing
 * the "Provider spend" mode on `/marketing/cost`.
 */

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { useQuery } from "@tanstack/react-query";
import type { paths } from "@/types/python-generated/api-types";

// TODO(deploy): new backend route, not yet regenerated into api-types.ts.
// Drop this cast once the backend deploys and the OpenAPI type sync runs
// (same pattern as ScheduleStatusPanel.tsx / RanksWorkspace.tsx).
const SPEND_SUMMARY_PATH = "/seo/spend/summary" as unknown as keyof paths;

export interface SeoProviderSpendRow {
  provider: string;
  reported_cost: number;
  estimated_cost: number;
  effective_cost: number;
  run_count: number;
  ceiling_usd: number;
  pct_used: number;
}

export interface SeoDailySpendPoint {
  date: string;
  effective_cost: number;
  run_count: number;
}

export interface SeoBudgetRejectionRow {
  run_id: string;
  provider: string;
  occurred_at: string;
  ceiling: string | null;
  limit_usd: number | null;
  spent_usd: number | null;
  projected_usd: number | null;
}

export interface SeoSpendSummary {
  organization_id: string;
  generated_at: string;
  this_month: SeoProviderSpendRow[];
  last_month: SeoProviderSpendRow[];
  daily_series: SeoDailySpendPoint[];
  org_provider_monthly_ceiling_usd: number;
  global_provider_monthly_ceiling_usd: number;
  recent_budget_rejections: SeoBudgetRejectionRow[];
}

export function useSeoSpendSummary() {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: ["marketing", "seo-spend-summary"],
    queryFn: async () => {
      const response = await dispatch(
        callApi({ path: SPEND_SUMMARY_PATH, method: "GET" }),
      );
      if (response.error) throw new Error(response.error.message);
      return response.data as unknown as SeoSpendSummary;
    },
  });
}
