/**
 * Surface manifest — Billing Spend (`matrx-admin/billing-spend`).
 *
 * The super-admin dashboard at `/administration/billing/spend` reads the
 * platform spend overview, a URL-driven ledger explorer, and the batch-savings
 * summary. It is intentionally read-only: it names and explains spend, but
 * does not mutate a ledger, a knob, or a billing configuration.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";

export const ADMIN_BILLING_SPEND_SURFACE_NAME = "matrx-admin/billing-spend";

const groups: SurfaceValueGroup[] = [
  { key: "dashboard", label: "Dashboard status", sortOrder: 100 },
  { key: "headline", label: "Spend headline", sortOrder: 200 },
  { key: "ledger", label: "Cost ledger", sortOrder: 300 },
  { key: "explorer", label: "Spend explorer", sortOrder: 400 },
  { key: "batch_savings", label: "Batch savings", sortOrder: 500 },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "viewer_timezone",
    label: "Viewer timezone",
    description:
      "IANA timezone used for the dashboard's local-day boundaries. Always present, with UTC used only when the browser cannot supply a valid zone.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 32,
    group: "dashboard",
    sortOrder: 100,
  },
  {
    name: "overview_loading",
    label: "Overview loading",
    description:
      "Whether the platform spend overview is currently being read. Always present; true means the dashboard has not yet received a safe overview.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "dashboard",
    sortOrder: 110,
  },
  {
    name: "overview_error",
    label: "Overview error",
    description:
      "The overview read failure message. Present only when the overview request fails.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "dashboard",
    sortOrder: 120,
  },
  {
    name: "fixed_monthly_status",
    label: "Fixed monthly cost status",
    description:
      "Whether the invoice-billed fixed monthly cost is loading, configured, not set, or unavailable. Always present; it prevents a missing fixed cost from reading as zero.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    group: "dashboard",
    sortOrder: 130,
  },
  {
    name: "fixed_monthly_usd",
    label: "Fixed monthly cost",
    description:
      "Configured invoice-billed monthly cost in USD. Present only when the fixed-cost knob resolved to a positive number.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "dashboard",
    sortOrder: 140,
  },
  {
    name: "spend_alarm_threshold_usd",
    label: "Spend alarm threshold",
    description:
      "Today's spend threshold in USD that changes the headline's tone. Absent while the threshold knob is loading or failed.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "dashboard",
    sortOrder: 150,
  },
  {
    name: "spend_alarm_error",
    label: "Spend alarm error",
    description:
      "Failure reading the spend alarm knobs. Present only when the knob read fails.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "dashboard",
    sortOrder: 160,
  },
  {
    name: "cost_sources_expanded",
    label: "Cost sources expanded",
    description:
      "Whether the folded Every cost source reference section is open. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "dashboard",
    sortOrder: 170,
  },
  {
    name: "print_orders_expanded",
    label: "Print orders expanded",
    description:
      "Whether the folded Print orders reference section is open. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "dashboard",
    sortOrder: 180,
  },

  {
    name: "spend_overview",
    label: "Spend overview",
    description:
      "The complete overview returned by admin_spend_overview: headline, daily series, cost ledgers, and print-order totals. Absent until the overview succeeds.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 18000,
    autoContext: false,
    group: "headline",
    sortOrder: 200,
  },
  {
    name: "overview_generated_at",
    label: "Overview generated at",
    description:
      "Timestamp when the current overview was generated. Absent until the overview succeeds.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "headline",
    sortOrder: 210,
  },
  {
    name: "headline_totals",
    label: "Headline totals",
    description:
      "The current headline's complete measured-spend totals and execution counts. Absent until the overview succeeds.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 350,
    group: "headline",
    sortOrder: 220,
  },
  {
    name: "today_spend_usd",
    label: "Today spend",
    description:
      "Measured platform spend today in USD. Absent until the overview succeeds; it is never a guessed zero.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 230,
  },
  {
    name: "today_execution_count",
    label: "Today executions",
    description:
      "Number of ledger executions contributing to today's measured spend. Absent until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "headline",
    sortOrder: 240,
  },
  {
    name: "yesterday_spend_usd",
    label: "Yesterday spend",
    description:
      "Measured platform spend during the prior local day. Absent until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 250,
  },
  {
    name: "last_7d_spend_usd",
    label: "Last seven days spend",
    description:
      "Measured platform spend over the latest seven local days. Absent until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 260,
  },
  {
    name: "last_30d_spend_usd",
    label: "Last thirty days spend",
    description:
      "Measured platform spend over the latest thirty local days. Absent until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 270,
  },
  {
    name: "month_to_date_spend_usd",
    label: "Month to date spend",
    description:
      "Measured platform spend from the first local day of this month through now. Absent until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 280,
  },
  {
    name: "month_projection_usd",
    label: "Month projection",
    description:
      "Projected full-month spend from the current month-to-date pace. Absent on day one and until the overview succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "headline",
    sortOrder: 290,
  },
  {
    name: "daily_spend_series",
    label: "Daily spend series",
    description:
      "Daily measured spend points used by the dashboard's recent-spend context. Absent until the overview succeeds.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    group: "headline",
    sortOrder: 300,
  },

  {
    name: "cost_ledgers",
    label: "Cost ledgers",
    description:
      "Every registered cost source with role, recency, row count, and totals. Absent until the overview succeeds; this is reference data, not automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 10000,
    autoContext: false,
    group: "ledger",
    sortOrder: 310,
  },
  {
    name: "known_cost_gaps",
    label: "Known cost gaps",
    description:
      "Cost-ledger entries whose role is gap or unmeasured. Absent until the overview succeeds; an empty array means the overview found no such entries.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    group: "ledger",
    sortOrder: 320,
  },
  {
    name: "print_order_totals",
    label: "Print order totals",
    description:
      "Revenue, refunds, fulfilment cost, margin, and counts for print orders. Absent until the overview succeeds; these are revenue context, not headline spend.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "ledger",
    sortOrder: 330,
  },

  {
    name: "explorer_window",
    label: "Explorer window",
    description:
      "Resolved explorer time window with preset, local date labels, and absolute from/to instants. Present after the browser-mounted explorer initializes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "explorer",
    sortOrder: 400,
  },
  {
    name: "explorer_window_preset",
    label: "Explorer window preset",
    description:
      "Selected explorer preset: today, yesterday, last24h, last7d, last30d, or custom. Present after the explorer initializes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "explorer",
    sortOrder: 410,
  },
  {
    name: "explorer_filters",
    label: "Explorer filters",
    description:
      "Active dimension-to-key drill-down filters from the URL. Present after the explorer initializes; an empty object means no drill-down is active.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "explorer",
    sortOrder: 420,
  },
  {
    name: "explorer_loading",
    label: "Explorer loading",
    description:
      "Whether the current explorer window/filter read is loading. Present after the explorer initializes.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "explorer",
    sortOrder: 430,
  },
  {
    name: "explorer_error",
    label: "Explorer error",
    description:
      "Explorer read failure message. Present after the explorer initializes; empty string means no explorer read failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "explorer",
    sortOrder: 440,
  },
  {
    name: "explorer_window_too_wide",
    label: "Explorer window too wide",
    description:
      "Whether the selected time range exceeds the database's 92-day cap. Present after the explorer initializes.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "explorer",
    sortOrder: 450,
  },
  {
    name: "explorer_thresholds",
    label: "Explorer thresholds",
    description:
      "The five resolved configurable thresholds used to identify expensive patterns. Absent while their knobs load or when they fail.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "explorer",
    sortOrder: 460,
  },
  {
    name: "explorer_knobs_error",
    label: "Explorer knobs error",
    description:
      "Failure reading the five explorer thresholds. Present after the explorer initializes; empty string means no knob read failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "explorer",
    sortOrder: 470,
  },
  {
    name: "spend_breakdown",
    label: "Spend breakdown",
    description:
      "Complete current-window breakdown: totals, dimensions, series, signals, and top requests. Absent until the breakdown succeeds; bindable-only because it can be large.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 40000,
    autoContext: false,
    group: "explorer",
    sortOrder: 480,
  },
  {
    name: "explorer_totals",
    label: "Explorer totals",
    description:
      "Current filtered-window execution, request, token, and cost totals. Absent until the breakdown succeeds.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "explorer",
    sortOrder: 490,
  },
  {
    name: "dimension_breakdowns",
    label: "Dimension breakdowns",
    description:
      "Current-window cost cuts by organization, user, agent, model, feature, and the other explorer dimensions. Absent until the breakdown succeeds; bindable-only due to size.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 22000,
    autoContext: false,
    group: "explorer",
    sortOrder: 500,
  },
  {
    name: "spend_signals",
    label: "Spend signals",
    description:
      "Current-window failed, context-heavy, iteration-heavy, hog, spike, burst, and unpriced-spend signals. Absent until the breakdown succeeds.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "explorer",
    sortOrder: 510,
  },
  {
    name: "top_spend_requests",
    label: "Top spend requests",
    description:
      "Most expensive individual requests in the current explorer window. Absent until the breakdown succeeds; bindable-only due to detail volume.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "explorer",
    sortOrder: 520,
  },

  {
    name: "batch_savings_loading",
    label: "Batch savings loading",
    description:
      "Whether the batch-savings summary for the explorer's current window is loading. Present only while the explorer mounts a valid window.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "batch_savings",
    sortOrder: 600,
  },
  {
    name: "batch_savings_error",
    label: "Batch savings error",
    description:
      "Batch-savings read failure message. Present only while the explorer mounts a valid window; empty string means no read failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 180,
    group: "batch_savings",
    sortOrder: 610,
  },
  {
    name: "batch_savings_summary",
    label: "Batch savings summary",
    description:
      "Complete batch savings result for the explorer's current window and optional organization filter. Absent until the batch-savings read succeeds; bindable-only due to detail tables.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "batch_savings",
    sortOrder: 620,
  },
  {
    name: "batch_saved_usd",
    label: "Batch savings",
    description:
      "Measured USD saved by batching in the selected window. Absent until the batch-savings read succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "batch_savings",
    sortOrder: 630,
  },
  {
    name: "batch_actual_usd",
    label: "Batch billed cost",
    description:
      "Provider-billed USD for the selected window's batch items. Absent until the batch-savings read succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "batch_savings",
    sortOrder: 640,
  },
  {
    name: "batch_live_equivalent_usd",
    label: "Batch live equivalent",
    description:
      "What the same batch work would cost at live catalog prices. Absent until the batch-savings read succeeds.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "batch_savings",
    sortOrder: 650,
  },
  {
    name: "batch_savings_breakdown_open",
    label: "Batch savings breakdown open",
    description:
      "Whether the by-consumer and by-model batch-savings tables are expanded. Present only while the batch-savings panel is mounted.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "batch_savings",
    sortOrder: 660,
  },
  {
    name: "batch_savings_ignored_filters",
    label: "Batch savings ignored filters",
    description:
      "Explorer dimensions the batch-savings reader cannot apply. Present only while the batch-savings panel is mounted; empty array means its result uses every active applicable filter.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "batch_savings",
    sortOrder: 670,
  },
];

export const adminBillingSpendManifest: SurfaceManifest = {
  surfaceName: ADMIN_BILLING_SPEND_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Runtime contract and DB mirror are wired; full independent S1-S18 surface certification remains.",
  label: "Billing Spend",
  urlPattern: "/administration/billing/spend",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin Billing Spend dashboard. It shows measured platform spend from runtime.global_execution, lets the operator inspect one URL-selected time window through dimensions and costly requests, and places cost-source gaps and batch savings beside that measured ledger.

Read the dashboard status before interpreting numbers: overview_loading or an error means the relevant figures are unavailable, not zero. headline_totals describes the broad platform view; explorer_window and explorer_filters describe the narrower view currently being analyzed; spend_breakdown is the full underlying explorer result. Cost ledgers and print orders are reference context, not additions to the headline. Batch savings compares completed batch work with the same work at live catalog prices; it is a saving measure, not a second spend ledger.

This surface is read-only. It has no agent role, write target, or custom action: summarize, diagnose, and explain the displayed evidence, but do not imply a ledger, knob, provider setting, or billing configuration was changed.
</surface_intro>`,
  groups,
  values: surfaceSpecific,
  skipBaselineValues: true,
};

/** Required keys mirror the values the dashboard always emits. */
export function createAdminBillingSpendScope(values: {
  viewer_timezone: string;
  overview_loading: boolean;
  fixed_monthly_status: "loading" | "configured" | "not_set" | "unavailable";
  cost_sources_expanded: boolean;
  print_orders_expanded: boolean;
  overview_error?: string;
  spend_alarm_error?: string;
  fixed_monthly_usd?: number;
  spend_alarm_threshold_usd?: number;
  spend_overview?: Record<string, unknown>;
  overview_generated_at?: string;
  headline_totals?: Record<string, unknown>;
  today_spend_usd?: number;
  today_execution_count?: number;
  yesterday_spend_usd?: number;
  last_7d_spend_usd?: number;
  last_30d_spend_usd?: number;
  month_to_date_spend_usd?: number;
  month_projection_usd?: number;
  daily_spend_series?: unknown[];
  cost_ledgers?: unknown[];
  known_cost_gaps?: unknown[];
  print_order_totals?: Record<string, unknown>;
  explorer_window?: Record<string, unknown>;
  explorer_window_preset?: string;
  explorer_filters?: Record<string, string>;
  explorer_loading?: boolean;
  explorer_error?: string;
  explorer_window_too_wide?: boolean;
  explorer_thresholds?: Record<string, number>;
  explorer_knobs_error?: string;
  spend_breakdown?: Record<string, unknown>;
  explorer_totals?: Record<string, unknown>;
  dimension_breakdowns?: Record<string, unknown>;
  spend_signals?: Record<string, unknown>;
  top_spend_requests?: unknown[];
  batch_savings_loading?: boolean;
  batch_savings_error?: string;
  batch_savings_summary?: Record<string, unknown>;
  batch_saved_usd?: number;
  batch_actual_usd?: number;
  batch_live_equivalent_usd?: number;
  batch_savings_breakdown_open?: boolean;
  batch_savings_ignored_filters?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
