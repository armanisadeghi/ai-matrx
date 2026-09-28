// features/marketing/seo/ai-visibility/panels/types.ts
//
// The ONE place the panel-family server contract is typed on the client.
//
// Shapes mirror the AI-visibility panel build contract (owner session,
// 2026-09-27): `GET /ai-visibility/panels/{id}/metrics` → PanelMetrics and the
// design doors (`POST /ai-visibility/panels/design`, `GET …/{id}/design`,
// `POST …/{id}/design/gates/{gate}`, `GET …/{id}/design/artifacts/{name}`).
//
// These routes are not in `types/python-generated/api-types.ts` yet (the
// backend lanes are landing them concurrently). When `pnpm sync-types` picks
// them up, replace these hand-written shapes with the generated
// `components["schemas"][...]` types in THIS file only — every consumer
// imports from here.

/** Contract codes — human text always goes through `format.ts`. */
export type PanelPartition = "core" | "rotating" | "sentinel" | "control" | "aided";
export type PanelLane =
  | "closed_model"
  | "retrieval"
  | "consumer_surface"
  | "campaign_experiment";
export type AidedStatus =
  | "unaided"
  | "target_aided"
  | "category_aided"
  | "competitor_aided";
export type PanelMetricKey =
  | "unaided_brand_presence"
  | "aided_brand_knowledge"
  | "competitive_mention_share"
  | "citation_presence"
  | "answer_framing"
  | "campaign_response";
export type PanelStatus = "draft" | "provisional_directional" | "frozen";
export type MetricShownAs = "rate" | "counts" | "not_set_up" | "unmeasured";

export interface MetricStratum {
  partition: string | null;
  lane: string | null;
  aided_status: string | null;
  engine: string | null;
  locale: string | null;
  market_side: string | null;
  wave_id: string | null;
}

export interface MetricInterval {
  low: number;
  high: number;
  method: string;
  level: number;
}

export interface MetricEstimate {
  metric: PanelMetricKey;
  display_name: string;
  does_not_prove: string;
  stratum: MetricStratum;
  numerator: number | null;
  denominator: number | null;
  distinct_slots: number;
  valid_observations: number;
  invalid_observations: number;
  /** 0..1, or null when not measured. NEVER coalesce null to 0. */
  rate: number | null;
  interval: MetricInterval | null;
  shown_as: MetricShownAs;
  effective_sample_size: number | null;
}

export interface PairedComparison {
  metric: PanelMetricKey;
  stratum: MetricStratum;
  from_wave: string;
  to_wave: string;
  overlap_slots: number;
  /** Difference in rate (0..1 scale), or null when not measurable. */
  change: number | null;
  interval: MetricInterval | null;
}

export interface PanelMetrics {
  panel_id: string;
  panel_status: PanelStatus | string;
  panel_version: string | null;
  conditional_note: string;
  evidence_ladder: string[];
  unclassified_questions: number;
  min_cells_for_rate: number;
  metrics: MetricEstimate[];
  comparisons: PairedComparison[];
}

// ─── Design workflow ────────────────────────────────────────────────────────

export type DesignRunStatus =
  | "running"
  | "waiting_for_gate"
  | "completed"
  | "failed";
export type DesignPerformer = "code" | "agent" | "human";
export type DesignStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";
export type GateNumber = 1 | 2 | 3 | 4;
export type GateStatus =
  | "not_reached"
  | "open"
  | "approved"
  | "edited"
  | "continued_pending";
export type GateDecision = "approve" | "edit" | "continue";

export interface DesignStep {
  key: string;
  label: string;
  performer: DesignPerformer;
  status: DesignStepStatus;
  detail: string | null;
}

export interface DesignGateRecord {
  gate: GateNumber;
  title: string;
  status: GateStatus;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
}

export interface DesignArtifactRef {
  name: string;
  version: number;
  content_hash: string;
  created_at: string;
}

export interface DesignNotice {
  code: string;
  message: string;
  remedy: string | null;
}

export interface Gate1Payload {
  sources: Array<{
    id: string;
    title: string;
    url: string | null;
    source_class: string;
    grade: string;
  }>;
  icps: Array<{
    id: string;
    context: string;
    confidence: string | number;
    status: string;
  }>;
  register_terms: Array<{ term: string; term_class: string }>;
  open_questions: string[];
  perimeter: Array<{
    area: string;
    covered_by: string[] | null;
    waiver: string | null;
  }>;
}

export interface Gate2Payload {
  jobs: Array<{
    id: string;
    statement: string;
    grade: string;
    confidence: string | number;
    roles: string[];
    language_samples: Array<{ text: string; source_id: string | null }>;
  }>;
}

export type QaDecision = "pass" | "revise" | "quarantine" | "reject";

export interface Gate3Question {
  candidate_id: string;
  text: string;
  band: string | null;
  aided_status: string | null;
  partition: string | null;
  qa_decision: QaDecision | string;
  qa_reason: string | null;
}

export interface Gate3Payload {
  questions: Gate3Question[];
  counts: { pass: number; revise: number; quarantine: number; reject: number };
  dropped_fragments: number;
  baseline_fields_blinded: true;
}

export interface Gate4Payload {
  version: string;
  weights: { exposure: unknown; priority: unknown };
  limitations: string[];
  cadence_days: number;
  repeats: number;
  engines: string[];
  lanes: string[];
  wave_cost_usd: number | null;
  wave_cost_basis: string | null;
}

export interface GateCard {
  gate: GateNumber;
  title: string;
  blind: boolean;
  wait_until: string | null;
  summary: string;
  payload: Record<string, unknown>;
}

export interface DesignRunView {
  panel_id: string;
  run_id: string;
  status: DesignRunStatus;
  panel_status: PanelStatus | string;
  steps: DesignStep[];
  open_gate: GateCard | null;
  gates: DesignGateRecord[];
  artifacts: DesignArtifactRef[];
  notices: DesignNotice[];
}

export interface DesignArtifactContent {
  name: string;
  version: number;
  content: unknown;
  content_hash: string;
}

export interface StartDesignBody {
  site_id: string;
  url: string;
  description: string;
  name?: string;
}

/** Gate 3 edits (contract); other gates record free JSON as the human decision. */
export interface Gate3Edits {
  keep_candidate_ids: string[];
  reasons: Record<string, string>;
}

export interface GateDecisionBody {
  decision: GateDecision;
  edits: Record<string, unknown> | null;
  note: string | null;
}
