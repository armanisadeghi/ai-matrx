// features/crm/deals/types.ts
//
// Types for CRM deals + pipelines. ALL row shapes derive from the generated
// `types/database.types.ts` (`crm` schema) — never hand-mirror a table shape.
//
// THE MODEL (migrations/crm_11_deals_pipelines.sql):
// - Pipelines and stages are `platform.categories` rows in ONE dimension,
//   `deal_pipeline`: a top-level row is a pipeline, its children (parent_id)
//   are the stages in `position` order. Stage semantics ride category
//   `metadata`: `{outcome: "won"|"lost", probability: 0..100}`.
// - THE STAGE IS THE AUTHORITY. Writers move `stage_id`; the DB derives
//   `status`, `closed_at` and `stage_entered_at`. Never write those columns.
// - Stage history is `crm.deal_stage_event`, appended by trigger.
// - The activity timeline is `crm.interaction.deal_id` — never a new table.

import type { Database } from "@/types/database.types";
import type { PlatformCategory } from "@/features/scopes/types";
import type { PartyRef } from "../types";

// ── Generated row aliases ───────────────────────────────────────────────────

export type DealRow = Database["crm"]["Tables"]["deal"]["Row"];
export type DealInsert = Database["crm"]["Tables"]["deal"]["Insert"];
export type DealUpdate = Database["crm"]["Tables"]["deal"]["Update"];

export type DealStageEventRow =
  Database["crm"]["Tables"]["deal_stage_event"]["Row"];

// ── Joined shapes ───────────────────────────────────────────────────────────

/** One list/board row: the deal plus its resolved primary party. */
export type DealListRow = DealRow & { party: PartyRef | null };

/** Everything the deal record page loads in one parallel batch. */
export interface DealDetail {
  deal: DealListRow;
  stageEvents: DealStageEventRow[];
  interactions: Database["crm"]["Tables"]["interaction"]["Row"][];
}

// ── Closed vocabularies (from the live CHECK constraints) ───────────────────

/** DERIVED by the DB from the stage's metadata.outcome — read-only client-side. */
export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
};

// ── Pipelines + stages (deal_pipeline categories, resolved client-side) ─────

/** One stage: the category row + its parsed metadata semantics. */
export interface DealStage {
  id: string;
  name: string;
  slug: string | null;
  position: number;
  /** "won"/"lost" close the deal on entry; undefined = an open stage. */
  outcome?: "won" | "lost";
  /** The stage's default win probability (a deal may override). */
  probability?: number;
  color: string | null;
}

/** One pipeline with its ordered stages. */
export interface DealPipeline {
  id: string;
  name: string;
  slug: string | null;
  position: number;
  isSystem: boolean;
  stages: DealStage[];
}

function parseStageMetadata(meta: Record<string, unknown> | null): {
  outcome?: "won" | "lost";
  probability?: number;
} {
  if (!meta) return {};
  const out: { outcome?: "won" | "lost"; probability?: number } = {};
  if (meta.outcome === "won" || meta.outcome === "lost") out.outcome = meta.outcome;
  if (
    typeof meta.probability === "number" &&
    meta.probability >= 0 &&
    meta.probability <= 100
  ) {
    out.probability = meta.probability;
  }
  return out;
}

/**
 * `deal_pipeline` category rows → pipeline trees. Top-level rows are the
 * pipelines, children are their stages; both come back from `cat_list` in
 * position order already, but we re-sort defensively.
 */
export function buildPipelines(rows: PlatformCategory[]): DealPipeline[] {
  const roots = rows.filter((r) => !r.parentId);
  const byParent = new Map<string, PlatformCategory[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = byParent.get(row.parentId) ?? [];
    list.push(row);
    byParent.set(row.parentId, list);
  }
  const pos = (r: PlatformCategory) => r.position ?? 0;
  return roots
    .sort((a, b) => pos(a) - pos(b))
    .map((root) => ({
      id: root.id,
      name: root.name,
      slug: root.slug,
      position: pos(root),
      isSystem: root.isSystem,
      stages: (byParent.get(root.id) ?? [])
        .sort((a, b) => pos(a) - pos(b))
        .map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          position: pos(s),
          color: s.color,
          ...parseStageMetadata(s.metadata),
        })),
    }))
    .filter((p) => p.stages.length > 0);
}

/** A deal's effective win probability: its own override, else the stage default. */
export function effectiveProbability(
  deal: Pick<DealRow, "probability">,
  stage: DealStage | undefined,
): number | null {
  if (deal.probability !== null && deal.probability !== undefined)
    return deal.probability;
  return stage?.probability ?? null;
}

// ── Money ───────────────────────────────────────────────────────────────────

/** Compact money for cells and column headers ("$12.5K", "€1.2M"). */
export function formatDealAmount(
  amount: number | null,
  currency: string,
): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: amount >= 100_000 ? "compact" : "standard",
      maximumFractionDigits: amount >= 100_000 ? 1 : 0,
    }).format(amount);
  } catch {
    // An unknown ISO code must never blank a cell — show the raw pair.
    return `${currency} ${amount.toLocaleString()}`;
  }
}

// ── List query (THE VIEW LAW — blended work scope, like outreach lists) ─────

/** Relative "within" buckets the date filters offer (mirrors the party list). */
export const DEAL_DATE_BUCKETS = [
  { value: "1d", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "90d", label: "Last 90 days", hours: 24 * 90 },
] as const;
export type DealDateBucket = (typeof DEAL_DATE_BUCKETS)[number]["value"];
export const DEAL_DATE_BUCKET_VALUES: readonly DealDateBucket[] =
  DEAL_DATE_BUCKETS.map((b) => b.value);

/** The status facet — open by default: a pipeline is worked, not browsed. */
export const DEAL_STATUS_FILTERS = ["open", "won", "lost", "all"] as const;
export type DealStatusFilter = (typeof DEAL_STATUS_FILTERS)[number];

export const DEAL_STATUS_FILTER_LABEL: Record<DealStatusFilter, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  all: "All",
};

/** Column filters the deals list can serve SERVER-SIDE via PostgREST. */
export interface DealListFilters {
  name?: string;
  stage_id?: string[];
  assigned_to?: string;
  status?: DealStatusFilter;
  expected_close_date?: DealDateBucket;
  updated_at?: DealDateBucket;
  created_at?: DealDateBucket;
}

export type DealListView = "active" | "trash";

export interface DealListQuery {
  /** Null = every pipeline; the board always narrows to one. */
  pipelineId: string | null;
  search: string;
  filters: DealListFilters;
  page: number;
  view: DealListView;
}

export const DEFAULT_DEAL_QUERY: DealListQuery = {
  pipelineId: null,
  search: "",
  // Open deals by default — closed ones are one facet click away.
  filters: { status: "open" },
  page: 1,
  view: "active",
};

/** Sort keys the service whitelists (DB columns only). */
export const DEAL_SORT_KEYS = [
  "name",
  "amount",
  "expected_close_date",
  "stage_entered_at",
  "closed_at",
  "created_at",
  "updated_at",
] as const;
export type DealSortKey = (typeof DEAL_SORT_KEYS)[number];

export const DEAL_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type DealSortDirection = (typeof DEAL_SORT_DIRECTIONS)[number];

export interface DealSortOpts {
  sort: string;
  direction: DealSortDirection;
  pageSize: number;
}

/** Every key `DealListFilters` accepts (table column-filter whitelist). */
export const DEAL_COLUMN_FILTER_KEYS = [
  "name",
  "stage_id",
  "assigned_to",
  "status",
  "expected_close_date",
  "updated_at",
  "created_at",
] as const;
export type DealColumnFilterKey = (typeof DEAL_COLUMN_FILTER_KEYS)[number];
