"use client";

/**
 * SEO provider spend rollup (M-9 / WS-7 UI tranche) — reads
 * `GET /seo/spend/summary`, a fast ordinary-JSON read (never streamed, same
 * "status panel, not a command" ruling `schedule-status` follows) backing
 * the "Provider spend" mode on `/marketing/cost`.
 */

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@/types/python-generated/api-types";
import { isJsonObject } from "@/types/json";

const SPEND_SUMMARY_PATH = "/seo/spend/summary";

type ApiProviderSpendRow = components["schemas"]["ProviderSpendRow"];
type ApiDailySpendPoint = components["schemas"]["DailySpendPoint"];
type ApiBudgetRejectionRow = components["schemas"]["BudgetRejectionRow"];
type ApiSeoSpendSummary = components["schemas"]["SeoSpendSummaryResponse"];

export type SeoProviderSpendRow = Omit<
  ApiProviderSpendRow,
  | "reported_cost"
  | "estimated_cost"
  | "effective_cost"
  | "billable_cost"
  | "ceiling_usd"
  | "pct_used"
> & {
  reported_cost: number;
  estimated_cost: number;
  effective_cost: number;
  billable_cost: number;
  ceiling_usd: number;
  pct_used: number;
};

export type SeoDailySpendPoint = Omit<
  ApiDailySpendPoint,
  "effective_cost" | "billable_cost"
> & {
  effective_cost: number;
  billable_cost: number;
};

export type SeoBudgetRejectionRow = Omit<
  ApiBudgetRejectionRow,
  "limit_usd" | "spent_usd" | "projected_usd"
> & {
  limit_usd?: number | null;
  spent_usd?: number | null;
  projected_usd?: number | null;
};

export type SeoSpendSummary = Omit<
  ApiSeoSpendSummary,
  | "this_month"
  | "last_month"
  | "daily_series"
  | "org_provider_monthly_ceiling_usd"
  | "global_provider_monthly_ceiling_usd"
  | "unpriced_run_assumed_cost_usd"
  | "recent_budget_rejections"
> & {
  this_month: SeoProviderSpendRow[];
  last_month: SeoProviderSpendRow[];
  daily_series: SeoDailySpendPoint[];
  org_provider_monthly_ceiling_usd: number;
  global_provider_monthly_ceiling_usd: number;
  unpriced_run_assumed_cost_usd: number;
  recent_budget_rejections: SeoBudgetRejectionRow[];
};

function decimal(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`SEO spend summary returned an invalid ${field}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`SEO spend summary returned an invalid ${field}.`);
  }
  return parsed;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`SEO spend summary returned an invalid ${field}.`);
  }
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`SEO spend summary returned an invalid ${field}.`);
  }
  return value;
}

function providerRow(value: unknown): SeoProviderSpendRow {
  if (!isJsonObject(value)) {
    throw new Error("SEO spend summary returned an invalid provider row.");
  }
  return {
    provider: stringValue(value.provider, "provider"),
    reported_cost: decimal(value.reported_cost, "reported cost"),
    estimated_cost: decimal(value.estimated_cost, "estimated cost"),
    effective_cost: decimal(value.effective_cost, "effective cost"),
    unpriced_runs: integer(value.unpriced_runs, "unpriced run count"),
    billable_cost: decimal(value.billable_cost, "billable cost"),
    run_count: integer(value.run_count, "run count"),
    ceiling_usd: decimal(value.ceiling_usd, "provider ceiling"),
    pct_used: decimal(value.pct_used, "percentage used"),
  };
}

function dailyPoint(value: unknown): SeoDailySpendPoint {
  if (!isJsonObject(value)) {
    throw new Error("SEO spend summary returned an invalid daily spend row.");
  }
  return {
    date: stringValue(value.date, "daily spend date"),
    effective_cost: decimal(value.effective_cost, "daily effective cost"),
    unpriced_runs: integer(value.unpriced_runs, "daily unpriced run count"),
    billable_cost: decimal(value.billable_cost, "daily billable cost"),
    run_count: integer(value.run_count, "daily run count"),
  };
}

function nullableDecimal(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : decimal(value, field);
}

function rejectionRow(value: unknown): SeoBudgetRejectionRow {
  if (!isJsonObject(value)) {
    throw new Error("SEO spend summary returned an invalid budget rejection row.");
  }
  return {
    run_id: stringValue(value.run_id, "budget rejection run id"),
    provider: stringValue(value.provider, "budget rejection provider"),
    occurred_at: stringValue(value.occurred_at, "budget rejection time"),
    ceiling:
      value.ceiling === null || value.ceiling === undefined
        ? null
        : stringValue(value.ceiling, "budget rejection ceiling"),
    limit_usd: nullableDecimal(value.limit_usd, "budget limit"),
    spent_usd: nullableDecimal(value.spent_usd, "budget spend"),
    projected_usd: nullableDecimal(value.projected_usd, "projected spend"),
  };
}

export function readSeoSpendSummary(value: unknown): SeoSpendSummary {
  if (
    !isJsonObject(value) ||
    !Array.isArray(value.this_month) ||
    !Array.isArray(value.last_month) ||
    !Array.isArray(value.daily_series) ||
    !Array.isArray(value.recent_budget_rejections)
  ) {
    throw new Error("SEO spend summary returned an invalid response.");
  }
  return {
    organization_id: stringValue(value.organization_id, "organization id"),
    generated_at: stringValue(value.generated_at, "generation time"),
    this_month: value.this_month.map(providerRow),
    last_month: value.last_month.map(providerRow),
    daily_series: value.daily_series.map(dailyPoint),
    org_provider_monthly_ceiling_usd: decimal(
      value.org_provider_monthly_ceiling_usd,
      "organization provider ceiling",
    ),
    global_provider_monthly_ceiling_usd: decimal(
      value.global_provider_monthly_ceiling_usd,
      "global provider ceiling",
    ),
    unpriced_run_assumed_cost_usd: decimal(
      value.unpriced_run_assumed_cost_usd,
      "unpriced run assumed cost",
    ),
    recent_budget_rejections: value.recent_budget_rejections.map(rejectionRow),
  };
}

export function useSeoSpendSummary() {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  return useQuery({
    queryKey: ["marketing", "seo-spend-summary", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      if (!organizationId) {
        throw new Error(
          "An organization is required to load the SEO spend summary.",
        );
      }
      const response = await dispatch(
        callApi({
          path: SPEND_SUMMARY_PATH,
          method: "GET",
          queryParams: { organization_id: organizationId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      return readSeoSpendSummary(response.data);
    },
  });
}
