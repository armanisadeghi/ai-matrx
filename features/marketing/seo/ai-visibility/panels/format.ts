// features/marketing/seo/ai-visibility/panels/format.ts
//
// Pure formatting for the panel family: contract codes → display names, and a
// metric estimate → the sentence a person reads.
//
// 🚨 DISPLAY NAMES ONLY IN HUMAN TEXT. A person never reads `core`, `B3` or
// `closed_model`; every code goes through a map here, and an unknown code is
// humanized (underscores → spaces), never shown raw.
//
// 🚨 NULL IS UNMEASURED, NEVER ZERO. `shown_as: "unmeasured"` (or a rate the
// server left null) reads "Not measured yet"; `campaign_response` with no
// pre-registered design reads "Not set up". Neither is ever "0%".

import { formatCost, type CostUnit } from "@ai-matrx/kit/format";
import { AI_VISIBILITY_ENGINES } from "../types";
import type {
  DesignPerformer,
  DesignStepStatus,
  GateStatus,
  MetricDefinition,
  MetricEstimate,
  MetricInterval,
  MetricStratum,
  PairedComparison,
  PanelMetricKey,
  QaDecision,
} from "./types";
import { currentCostUnit } from "@/components/cost/costUnit";

function humanize(code: string): string {
  return code.replaceAll("_", " ").trim();
}

function lookup(map: Record<string, string>, code: string | null | undefined): string | null {
  if (!code) return null;
  return map[code] ?? humanize(code);
}

export const PARTITION_NAMES: Record<string, string> = {
  core: "tracked set",
  rotating: "discovery set",
  sentinel: "tripwire",
  control: "false-positive check",
  aided: "prompted set",
};

export const LANE_NAMES: Record<string, string> = {
  closed_model: "no web access",
  retrieval: "with web search",
  consumer_surface: "the real app",
  campaign_experiment: "campaign test",
};

export const AIDED_STATUS_NAMES: Record<string, string> = {
  unaided: "unprompted",
  target_aided: "we're named",
  category_aided: "category named",
  competitor_aided: "competitors named",
};

/** Question bands, by contract code (B0..B5) or by their plain key. */
export const BAND_NAMES: Record<string, string> = {
  B0: "Brand",
  B1: "Shortlist",
  B2: "Category",
  B3: "Problem",
  B4: "Goal",
  B5: "Market",
  brand: "Brand",
  shortlist: "Shortlist",
  category: "Category",
  problem: "Problem",
  goal: "Goal",
  market: "Market",
};

export const METRIC_NAMES: Record<PanelMetricKey, string> = {
  unaided_brand_presence: "Named, unprompted",
  aided_brand_knowledge: "Known when named",
  competitive_mention_share: "Share of mentions",
  citation_presence: "Cited as a source",
  answer_framing: "How answers describe you",
  campaign_response: "Campaign response",
};

/** Screen order. The first two render side by side — they replace the old pooled "Named in answers". */
export const METRIC_ORDER: PanelMetricKey[] = [
  "unaided_brand_presence",
  "aided_brand_knowledge",
  "competitive_mention_share",
  "citation_presence",
  "answer_framing",
  "campaign_response",
];

export const ARTIFACT_NAMES: Record<string, string> = {
  measurement_charter: "Measurement charter",
  source_manifest: "Sources",
  icp_hypotheses: "Customer profiles",
  buyer_jobs: "Buyer jobs",
  contamination_register: "Brand-name register",
  blind_design_brief: "Blind design brief",
  prompt_architecture: "Question slots",
  prompt_universe: "All written questions",
  prompt_qa: "Question checks",
  panel: "Panel",
  tracking_plan: "Tracking plan",
  run_manifest_template: "Run template",
  panel_change_ledger: "Change ledger",
  panel_report: "Panel report",
};

export const partitionName = (code: string | null | undefined) =>
  lookup(PARTITION_NAMES, code);
export const laneName = (code: string | null | undefined) => lookup(LANE_NAMES, code);
export const aidedStatusName = (code: string | null | undefined) =>
  lookup(AIDED_STATUS_NAMES, code);
export const bandName = (code: string | null | undefined) => lookup(BAND_NAMES, code);
export const artifactName = (code: string) => lookup(ARTIFACT_NAMES, code) ?? code;

export function engineName(code: string | null | undefined): string | null {
  if (!code) return null;
  return AI_VISIBILITY_ENGINES.find((engine) => engine.id === code)?.label ?? humanize(code);
}

export function metricName(metric: string): string {
  return lookup(METRIC_NAMES, metric) ?? metric;
}

export function performerName(performer: DesignPerformer | string): string {
  return (
    { code: "Automatic", agent: "AI step", human: "Your review" }[performer] ??
    humanize(performer)
  );
}

export function stepStatusName(status: DesignStepStatus | string): string {
  return (
    {
      pending: "Waiting",
      running: "Running",
      done: "Done",
      failed: "Failed",
      skipped: "Skipped",
    }[status] ?? humanize(status)
  );
}

export function gateStatusName(status: GateStatus | string): string {
  return (
    {
      not_reached: "Not reached yet",
      open: "Waiting for you",
      approved: "Approved",
      edited: "Approved with your edits",
      continued_pending: "Continued without approval",
    }[status] ?? humanize(status)
  );
}

export function qaDecisionName(decision: QaDecision | string): string {
  return (
    {
      pass: "Passed",
      revise: "Revised",
      quarantine: "Set aside",
      reject: "Rejected",
    }[decision] ?? humanize(decision)
  );
}

export interface PanelStatusInfo {
  label: string;
  tone: "secondary" | "warning" | "success";
  explanation: string;
}

export function panelStatusInfo(status: string | null | undefined): PanelStatusInfo {
  switch (status) {
    case "frozen":
      return {
        label: "Frozen",
        tone: "success",
        explanation:
          "Every review was approved and this version's questions are locked. Any change makes a new version, so numbers stay comparable.",
      };
    case "provisional_directional":
      return {
        label: "Provisional",
        tone: "warning",
        explanation:
          "At least one review was skipped or is still waiting. The panel runs, but its numbers are directional until every review is approved.",
      };
    case "draft":
      return {
        label: "Draft",
        tone: "secondary",
        explanation:
          "Still being designed. Nothing is measured against a draft panel yet.",
      };
    default:
      return {
        label: status ? humanize(status) : "Not designed",
        tone: "secondary",
        explanation: status
          ? "The server reported a panel state this page does not know yet."
          : "This panel's questions were typed in by hand, not designed by the workflow.",
      };
  }
}

// ─── Numbers ────────────────────────────────────────────────────────────────

/** 0..1 → "42%" (one decimal under 10%). */
export function percent(value: number): string {
  const pct = value * 100;
  const rounded = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  return `${rounded}%`;
}

function points(value: number): string {
  const pts = value * 100;
  const rounded = Math.abs(pts) < 10 ? Math.round(pts * 10) / 10 : Math.round(pts);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}`;
}

export function intervalMethodText(interval: MetricInterval | null): string | null {
  if (!interval) return null;
  const level = interval.level <= 1 ? interval.level * 100 : interval.level;
  return `${Math.round(level)}% interval, ${humanize(interval.method)}`;
}

export type MetricValueKind = "rate" | "counts" | "not_set_up" | "unmeasured";

export interface MetricValueText {
  kind: MetricValueKind;
  /** The big value on the card. */
  value: string;
  /** The line under it (interval, or why there is no percentage). */
  detail: string | null;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/**
 * The sentence for one estimate. The server decides `shown_as`; this only
 * refuses to invent a number the server did not send.
 */
export function formatMetricValue(
  estimate: Pick<
    MetricEstimate,
    | "shown_as"
    | "rate"
    | "interval"
    | "numerator"
    | "denominator"
    | "distinct_slots"
  >,
  minCellsForRate?: number,
): MetricValueText {
  if (estimate.shown_as === "not_set_up") {
    return {
      kind: "not_set_up",
      value: "Not set up",
      detail: "Needs a campaign test designed before anything is measured.",
    };
  }
  if (estimate.shown_as === "unmeasured") {
    return { kind: "unmeasured", value: "Not measured yet", detail: null };
  }
  if (estimate.shown_as === "counts") {
    if (estimate.numerator === null || estimate.denominator === null) {
      return { kind: "unmeasured", value: "Not measured yet", detail: null };
    }
    const tooFew =
      minCellsForRate !== undefined
        ? `too few for a percentage (needs ${minCellsForRate} question slots)`
        : "too few for a percentage";
    return {
      kind: "counts",
      value: `${estimate.numerator.toLocaleString()} of ${plural(estimate.denominator, "answer", "answers")}`,
      detail: `${plural(estimate.distinct_slots, "question slot", "question slots")} — ${tooFew}`,
    };
  }
  // shown_as === "rate"
  if (estimate.rate === null) {
    return { kind: "unmeasured", value: "Not measured yet", detail: null };
  }
  return {
    kind: "rate",
    value: percent(estimate.rate),
    detail: estimate.interval
      ? `${percent(estimate.interval.low)} to ${percent(estimate.interval.high)}`
      : "no interval reported",
  };
}

/** "11 valid answers · 7 question slots · 2 invalid left out · effective size 9.4" */
export function sampleSizeText(
  estimate: Pick<
    MetricEstimate,
    "valid_observations" | "distinct_slots" | "invalid_observations" | "effective_sample_size"
  >,
): string {
  const parts = [
    plural(estimate.valid_observations, "valid answer", "valid answers"),
    plural(estimate.distinct_slots, "question slot", "question slots"),
  ];
  if (estimate.invalid_observations > 0) {
    parts.push(`${estimate.invalid_observations.toLocaleString()} invalid left out`);
  }
  if (estimate.effective_sample_size !== null) {
    parts.push(`effective size ${Math.round(estimate.effective_sample_size * 10) / 10}`);
  }
  return parts.join(" · ");
}

/** How the number was made, in words. */
export function methodText(
  estimate: Pick<MetricEstimate, "shown_as" | "interval">,
  minCellsForRate?: number,
): string {
  switch (estimate.shown_as) {
    case "rate":
      return intervalMethodText(estimate.interval) ?? "Share of valid answers";
    case "counts":
      return minCellsForRate !== undefined
        ? `Counts only — under ${minCellsForRate} distinct question slots`
        : "Counts only — too few question slots for a percentage";
    case "not_set_up":
      return "Needs a pre-registered campaign test";
    default:
      return "No valid answers yet";
  }
}

/** "tracked set · with web search · ChatGPT · en-US · wave 2026-09-20" — every set dimension, aided status excluded. */
export function stratumLabel(
  stratum: MetricStratum,
  { includeAided = false }: { includeAided?: boolean } = {},
): string {
  const parts = [
    partitionName(stratum.partition),
    laneName(stratum.lane),
    includeAided ? aidedStatusName(stratum.aided_status) : null,
    engineName(stratum.engine),
    stratum.locale,
    stratum.market_side ? `${humanize(stratum.market_side)} side` : null,
    stratum.wave_id ? `wave ${stratum.wave_id}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "All answers in this group";
}

export interface MetricGroup {
  metric: PanelMetricKey;
  displayName: string;
  doesNotProve: string;
  estimates: MetricEstimate[];
}

/**
 * Group estimates by metric in screen order. Nothing is summed or averaged —
 * each estimate stays its own stratum (the pooled headline is gone for good).
 * A metric the server sent nothing for still gets a group, so its absence
 * reads "Not measured yet" instead of disappearing.
 */
export function groupMetrics(
  estimates: MetricEstimate[],
  definitions: MetricDefinition[] = [],
): MetricGroup[] {
  return METRIC_ORDER.map((metric) => {
    const mine = estimates.filter((estimate) => estimate.metric === metric);
    const definition = definitions.find((d) => d.metric === metric);
    return {
      metric,
      displayName: mine[0]?.display_name || definition?.display_name || METRIC_NAMES[metric],
      doesNotProve: mine[0]?.does_not_prove || definition?.does_not_prove || "",
      estimates: [...mine].sort((a, b) =>
        stratumLabel(a.stratum).localeCompare(stratumLabel(b.stratum)),
      ),
    };
  });
}

/** "change on 14 unchanged question slots: +6 points (−2 to +14)" */
export function formatComparison(comparison: PairedComparison): string {
  const scope = `change on ${plural(comparison.overlap_slots, "unchanged question slot", "unchanged question slots")}`;
  if (comparison.change === null) return `${scope}: not measured yet`;
  const interval = comparison.interval
    ? ` (${points(comparison.interval.low)} to ${points(comparison.interval.high)})`
    : "";
  return `${scope}: ${points(comparison.change)} points${interval}`;
}

export function formatWaveCost(
  value: number | null | undefined,
  unit: CostUnit = currentCostUnit(),
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return formatCost(value, { unit });
}

export interface AidedPivotRow {
  /** The stratum with prompted state left out — the row identity. */
  label: string;
  /** One cell per column in `columns`; null where that prompted state was not asked. */
  cells: Array<MetricEstimate | null>;
}

export interface AidedPivot {
  /** Prompted-state codes in screen order ("unprompted" first, then "we're named", …). */
  columns: Array<string | null>;
  rows: AidedPivotRow[];
}

const AIDED_ORDER = ["unaided", "target_aided", "category_aided", "competitor_aided"];

/**
 * Lay a metric's estimates out so "unprompted" and "we're named" for the same
 * set, lane, engine, locale and wave sit SIDE BY SIDE in one row — compared,
 * never pooled. Each cell is one server estimate, untouched.
 */
export function pivotByAidedStatus(estimates: MetricEstimate[]): AidedPivot {
  const columns = [...new Set(estimates.map((estimate) => estimate.stratum.aided_status))].sort(
    (a, b) => {
      const ia = a === null ? 99 : AIDED_ORDER.indexOf(a);
      const ib = b === null ? 99 : AIDED_ORDER.indexOf(b);
      return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib);
    },
  );
  const rows = new Map<string, AidedPivotRow>();
  for (const estimate of estimates) {
    const label = stratumLabel(estimate.stratum);
    const row = rows.get(label) ?? { label, cells: columns.map(() => null) };
    row.cells[columns.indexOf(estimate.stratum.aided_status)] = estimate;
    rows.set(label, row);
  }
  return {
    columns,
    rows: [...rows.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/** The server numbers its ladder rungs ("1. A mention…"); the list numbers them already. */
export function ladderRung(text: string): string {
  return text.replace(/^\s*\d+\.\s+/, "");
}
