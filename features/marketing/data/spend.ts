"use client";

/**
 * SEO provider spend rollup (M-9 / WS-7 UI tranche) — reads
 * `GET /seo/spend/summary`, a fast ordinary-JSON read (never streamed, same
 * "status panel, not a command" ruling `schedule-status` follows) backing
 * the "Provider spend" mode on `/marketing/cost`.
 */

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@ai-matrx/agents/generated/api-types";
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
  /** This month's social-data cost (USD) and calls; null when the server did not send it (older server) or could not read it. */
  social_this_month_usd: number | null;
  social_this_month_calls: number | null;
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
    social_this_month_usd: nullableDecimal(value.social_this_month_usd, "social cost"),
    social_this_month_calls:
      typeof value.social_this_month_calls === "number" ? value.social_this_month_calls : null,
  };
}

/** The rollup for one organization, or every organization read merged into one. */
export type SeoSpendRollup = SeoSpendSummary & {
  /** Organizations the rollup was asked of that could not be read (named by id, never dropped silently). */
  unreadOrganizationIds: string[];
  /** How many organizations the numbers cover. */
  organizationCount: number;
};

function mergeProviderRows(
  lists: SeoProviderSpendRow[][],
): SeoProviderSpendRow[] {
  const byProvider = new Map<string, SeoProviderSpendRow>();
  for (const row of lists.flat()) {
    const held = byProvider.get(row.provider);
    if (!held) {
      byProvider.set(row.provider, { ...row });
      continue;
    }
    held.reported_cost += row.reported_cost;
    held.estimated_cost += row.estimated_cost;
    held.effective_cost += row.effective_cost;
    held.billable_cost += row.billable_cost;
    held.unpriced_runs += row.unpriced_runs;
    held.run_count += row.run_count;
    held.ceiling_usd += row.ceiling_usd;
  }
  for (const row of byProvider.values()) {
    row.pct_used =
      row.ceiling_usd > 0 ? (row.effective_cost / row.ceiling_usd) * 100 : 0;
  }
  return [...byProvider.values()];
}

/** Sum of the figures that are known; null only when none is. */
function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/**
 * Several organizations' summaries as ONE (All organizations). Costs, runs and each provider's
 * ceiling add up across organizations; the daily series merges by date; rejections interleave
 * newest first. The per-organization and platform ceilings stay the single values every summary
 * reports (the largest, so no organization's ceiling is understated).
 */
export function mergeSeoSpendSummaries(
  summaries: SeoSpendSummary[],
  unreadOrganizationIds: string[] = [],
): SeoSpendRollup {
  if (summaries.length === 0) {
    throw new Error("There is no SEO spend summary to merge.");
  }
  const days = new Map<string, SeoDailySpendPoint>();
  for (const point of summaries.flatMap((s) => s.daily_series)) {
    const held = days.get(point.date);
    if (!held) {
      days.set(point.date, { ...point });
      continue;
    }
    held.effective_cost += point.effective_cost;
    held.billable_cost += point.billable_cost;
    held.unpriced_runs += point.unpriced_runs;
    held.run_count += point.run_count;
  }
  return {
    ...summaries[0],
    organization_id: summaries.length === 1 ? summaries[0].organization_id : "all",
    generated_at: summaries
      .map((s) => s.generated_at)
      .sort()
      .at(-1) as string,
    this_month: mergeProviderRows(summaries.map((s) => s.this_month)),
    last_month: mergeProviderRows(summaries.map((s) => s.last_month)),
    daily_series: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    org_provider_monthly_ceiling_usd: Math.max(
      ...summaries.map((s) => s.org_provider_monthly_ceiling_usd),
    ),
    global_provider_monthly_ceiling_usd: Math.max(
      ...summaries.map((s) => s.global_provider_monthly_ceiling_usd),
    ),
    unpriced_run_assumed_cost_usd: Math.max(
      ...summaries.map((s) => s.unpriced_run_assumed_cost_usd),
    ),
    recent_budget_rejections: summaries
      .flatMap((s) => s.recent_budget_rejections)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    social_this_month_usd: sumKnown(summaries.map((s) => s.social_this_month_usd)),
    social_this_month_calls: sumKnown(summaries.map((s) => s.social_this_month_calls)),
    unreadOrganizationIds,
    organizationCount: summaries.length,
  };
}

/**
 * The SEO spend rollup for the PAGE'S ORGANIZATION FILTER — `null` = All organizations (the
 * default), one id = that organization. Never the active organization: it is a read, so it covers
 * everything the person may see (active-org-is-never-a-list-filter law). Each request names its
 * organization explicitly on the wire.
 */
export function useSeoSpendSummary(orgFilter: string | null) {
  const dispatch = useAppDispatch();
  const { organizations, loading: organizationsLoading } = useUserOrganizations();
  const organizationIds = orgFilter
    ? [orgFilter]
    : organizations.map((org) => org.id);
  const key = organizationIds.join(",");
  return useQuery({
    queryKey: ["marketing", "seo-spend-summary", key],
    enabled: !organizationsLoading && organizationIds.length > 0,
    queryFn: async (): Promise<SeoSpendRollup> => {
      const settled = await Promise.allSettled(
        organizationIds.map(async (organizationId) => {
          const response = await dispatch(
            callApi({
              path: SPEND_SUMMARY_PATH,
              method: "GET",
              queryParams: { organization_id: organizationId },
              // The call RUNS in the organization it asks about (the wire header and the query
              // must agree) — not in whichever organization happens to be active.
              scopeOverrides: { organization_id: organizationId },
            }),
          );
          if (response.error) throw new Error(response.error.message);
          return readSeoSpendSummary(response.data);
        }),
      );
      const summaries: SeoSpendSummary[] = [];
      const unread: string[] = [];
      let firstError: unknown = null;
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") summaries.push(result.value);
        else {
          unread.push(organizationIds[index]);
          firstError ??= result.reason;
        }
      });
      if (summaries.length === 0) {
        throw firstError instanceof Error
          ? firstError
          : new Error("The SEO spend summary could not be loaded.");
      }
      return mergeSeoSpendSummaries(summaries, unread);
    },
  });
}
