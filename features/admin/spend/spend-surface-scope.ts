// Runtime scope builders for `matrx-admin/billing-spend`.
//
// They only reshape state the dashboard has already rendered. Surface Context
// samples these getters while open, so none of them may fetch or derive a
// second version of the ledger.

import { createAdminBillingSpendScope } from "@/features/surfaces/manifests/admin-billing-spend.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { BatchSavingsSummary } from "@/features/batch-savings/types";

import type { SpendExplorerKnobsState } from "./useSpendExplorerKnobs";
import type { SpendPopoverKnobsState } from "./useSpendPopoverKnobs";
import type { SpendBreakdown, SpendFilters, SpendOverview } from "./types";
import type { ExplorerUrlState, SpendWindow } from "./windows";

type FixedMonthly = number | null | "missing";

function record(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function activeFilters(filters: SpendFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function buildBillingSpendDashboardScope({
  timezone,
  data,
  loading,
  error,
  fixedMonthly,
  knobs,
  costSourcesExpanded,
  printOrdersExpanded,
}: {
  timezone: string;
  data: SpendOverview | null;
  loading: boolean;
  error: Error | null;
  fixedMonthly: FixedMonthly;
  knobs: SpendPopoverKnobsState;
  costSourcesExpanded: boolean;
  printOrdersExpanded: boolean;
}): SurfaceScopePayload {
  const fixedMonthlyStatus =
    fixedMonthly === null
      ? "loading"
      : fixedMonthly === "missing"
        ? "unavailable"
        : fixedMonthly > 0
          ? "configured"
          : "not_set";
  const headline = data?.headline;
  const gaps = data?.ledgers.filter(
    (ledger) => ledger.role === "gap" || ledger.role === "unmeasured",
  );

  return createAdminBillingSpendScope({
    viewer_timezone: timezone,
    overview_loading: loading,
    fixed_monthly_status: fixedMonthlyStatus,
    cost_sources_expanded: costSourcesExpanded,
    print_orders_expanded: printOrdersExpanded,
    ...(error ? { overview_error: error.message } : {}),
    ...(knobs.error ? { spend_alarm_error: knobs.error.message } : {}),
    ...(typeof fixedMonthly === "number" && fixedMonthly > 0
      ? { fixed_monthly_usd: fixedMonthly }
      : {}),
    ...(knobs.knobs
      ? { spend_alarm_threshold_usd: knobs.knobs.scareThresholdUsd }
      : {}),
    ...(data
      ? {
          spend_overview: record(data),
          overview_generated_at: data.generatedAt,
          headline_totals: record(data.headline),
          today_spend_usd: headline?.today,
          today_execution_count: headline?.todayRuns,
          yesterday_spend_usd: headline?.yesterday,
          last_7d_spend_usd: headline?.last7d,
          last_30d_spend_usd: headline?.last30d,
          month_to_date_spend_usd: headline?.monthToDate,
          ...(headline?.monthProjection === null ||
          headline?.monthProjection === undefined
            ? {}
            : { month_projection_usd: headline.monthProjection }),
          daily_spend_series: data.byDay,
          cost_ledgers: data.ledgers,
          known_cost_gaps: gaps,
          print_order_totals: record(data.printOrders),
        }
      : {}),
  });
}

export function buildBillingSpendExplorerScope({
  urlState,
  window,
  windowLabel,
  windowTooWide,
  knobs,
  loading,
  error,
  data,
}: {
  urlState: ExplorerUrlState;
  window: SpendWindow;
  windowLabel: string;
  windowTooWide: boolean;
  knobs: SpendExplorerKnobsState;
  loading: boolean;
  error: Error | null;
  data: SpendBreakdown | null;
}): SurfaceScopePayload {
  return {
    explorer_window: {
      preset: window.preset,
      label: windowLabel,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      custom_from_day: urlState.fromDay?.toISOString() ?? null,
      custom_to_day: urlState.toDay?.toISOString() ?? null,
    },
    explorer_window_preset: urlState.preset,
    explorer_filters: activeFilters(urlState.filters),
    explorer_loading: loading,
    explorer_error: error?.message ?? "",
    explorer_window_too_wide: windowTooWide,
    explorer_knobs_error: knobs.error?.message ?? "",
    ...(knobs.thresholds
      ? { explorer_thresholds: record(knobs.thresholds) }
      : {}),
    ...(data
      ? {
          spend_breakdown: record(data),
          explorer_totals: record(data.totals),
          dimension_breakdowns: record(data.dimensions),
          spend_signals: record(data.signals),
          top_spend_requests: data.topRequests,
        }
      : {}),
  } as SurfaceScopePayload;
}

export function buildBillingBatchSavingsScope({
  loading,
  error,
  data,
  breakdownOpen,
  ignoredFilters,
}: {
  loading: boolean;
  error: Error | null;
  data: BatchSavingsSummary | null;
  breakdownOpen: boolean;
  ignoredFilters: string[];
}): SurfaceScopePayload {
  return {
    batch_savings_loading: loading,
    batch_savings_error: error?.message ?? "",
    batch_savings_breakdown_open: breakdownOpen,
    batch_savings_ignored_filters: ignoredFilters,
    ...(data
      ? {
          batch_savings_summary: record(data),
          batch_saved_usd: data.savedUsd,
          batch_actual_usd: data.actualUsd,
          batch_live_equivalent_usd: data.liveEquivalentUsd,
        }
      : {}),
  } as SurfaceScopePayload;
}
