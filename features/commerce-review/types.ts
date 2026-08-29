/**
 * features/commerce-review/types.ts
 *
 * W11 — the two human gates and the attention queue over the C1 `commerce`
 * schema (applied + certified 2026-08-29): warehouse triage (gate 1,
 * `awaiting_triage` → a value_bucket decision), lister craft (gate 2,
 * `in_review` → approve/revise/reject of the AI listing draft), and the
 * attention queue (open recall_audit disagreements + escalations +
 * high-impact unknowns).
 *
 * TYPING NOTE (same documented removal path as
 * `features/commerce-intake/types.ts`): `commerce` is not yet in the
 * generated `types/database.types.ts`, so these rows are hand-declared
 * against the LIVE columns (schema.sql, applied 2026-08-29) and the client
 * is cast through `CommerceReviewSchema`. When `commerce` lands in the
 * generated types, delete these declarations and project from
 * `Database["commerce"]`. The intake-side rows are NOT re-declared — they
 * are imported from `features/commerce-intake/types.ts` (W4 owns them).
 */

import type { Json } from "@/types/database.types";
import type {
  IntakeAssetRow,
  PipelineState,
} from "@/features/commerce-intake/types";

/** Gate-1 value buckets (live CHECK `intake_asset_bucket_chk`). */
export type ValueBucket =
  | "definite_value"
  | "conditional_value"
  | "possible_value"
  | "no_value"
  | "unknown";

export const VALUE_BUCKETS: readonly ValueBucket[] = [
  "definite_value",
  "conditional_value",
  "possible_value",
  "no_value",
  "unknown",
] as const;

export type MandateStep =
  | "segmentation"
  | "extraction"
  | "lot_detection"
  | "research"
  | "valuation"
  | "grading"
  | "pricing"
  | "enrichment"
  | "listing_draft"
  | "preflight"
  | "review";

export type ReviewVerdict = "approve" | "revise" | "reject";
export type CorrectionGate = "gate_1" | "gate_2" | "publish" | "post_sale";
export type RecallVerdict = "original_correct" | "challenge_correct" | "inconclusive";

// ── Row shapes (live columns; component tables — no soft delete/version) ────

export interface AssetMandateResultRow {
  id: string;
  intake_asset_id: string;
  step: MandateStep;
  mandate_key: string;
  output_kind: string | null;
  agent_run_id: string | null;
  resolved_agent_id: string | null;
  fulfillment_source: "agent" | "human" | "external_system";
  output: Json;
  confidence: number | null;
  reasoning: string | null;
  run_status: string;
  superseded_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  cost: Json | null;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
}

export interface RecallAuditRow {
  id: string;
  intake_asset_id: string | null;
  product_id: string | null;
  audit_kind: "refutation_sweep" | "disposal_audit" | "inad_trace";
  original_bucket: string | null;
  original_confidence: number | null;
  original_result_id: string | null;
  original_agent_id: string | null;
  original_agent_version: string | null;
  challenge_bucket: string | null;
  challenge_confidence: number | null;
  challenge_reasoning: string | null;
  challenge_agent_id: string | null;
  challenge_agent_version: string | null;
  challenge_value_estimate: number | null;
  is_disagreement: boolean;
  disagreement_value_delta: number | null;
  escalated_at: string | null;
  human_verdict: RecallVerdict | null;
  human_verdict_at: string | null;
  human_verdict_by: string | null;
  days_since_disposal: number | null;
  market_value_at_audit: number | null;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
}

export interface HumanCorrectionRow {
  id: string;
  intake_asset_id: string | null;
  product_id: string | null;
  source_result_id: string | null;
  mandate_key: string | null;
  gate: CorrectionGate | null;
  field_path: string;
  before_value: string | null;
  after_value: string | null;
  correction_reason: string | null;
  is_near_miss: boolean;
  corrected_by: string | null;
  corrected_at: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
}

export interface AssetReviewRow {
  id: string;
  intake_asset_id: string;
  review_round: number;
  lens: string;
  is_final_arbiter: boolean;
  mandate_key: string | null;
  verdict: ReviewVerdict;
  findings: Json;
  reasoning: string | null;
  agent_run_id: string | null;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
}

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface CommerceReviewSchema {
  Tables: {
    intake_asset: TableShape<IntakeAssetRow>;
    asset_mandate_result: TableShape<AssetMandateResultRow>;
    recall_audit: TableShape<RecallAuditRow>;
    human_correction: TableShape<HumanCorrectionRow>;
    asset_review: TableShape<AssetReviewRow>;
  };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
}

// ── UI shapes ───────────────────────────────────────────────────────────────

/** One gate-1 triage card: the asset plus what the AI concluded about it. */
export interface TriageItem {
  assetId: string;
  organizationId: string;
  version: number;
  pipelineState: PipelineState;
  notes: string;
  isGemCandidate: boolean;
  estimatedValue: number | null;
  estimatedValueCurrency: string | null;
  /** Latest live valuation result — the AI's bucket call this gate confirms or corrects. */
  aiBucket: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  valuationResultId: string | null;
  valuationMandateKey: string | null;
  /** Photo file_ids in capture order (first = the card image). */
  photoFileIds: string[];
  createdAt: string;
}

/** One gate-2 draft card: the asset plus its live listing draft. */
export interface DraftItem {
  assetId: string;
  organizationId: string;
  version: number;
  notes: string;
  /** The live (non-superseded, succeeded) listing_draft result. */
  draftResultId: string | null;
  draftMandateKey: string | null;
  confidence: number | null;
  reasoning: string | null;
  /** The draft's fields, flattened to editable strings. */
  fields: DraftField[];
  photoFileIds: string[];
  createdAt: string;
}

export interface DraftField {
  /** `title` | `description` | `price` | `aspect:Brand` … — the learning tap's field_path. */
  path: string;
  label: string;
  value: string;
  multiline: boolean;
}

export type AttentionKind =
  | "recall_disagreement"
  | "recall_escalation"
  | "high_impact_unknown";

/** One attention row — each opens its asset. */
export interface AttentionItem {
  kind: AttentionKind;
  /** recall_audit.id or asset_unknown.id. */
  id: string;
  assetId: string | null;
  title: string;
  detail: string;
  createdAt: string;
  /** For recall rows: the audit row itself (verdict actions render from it). */
  audit?: RecallAuditRow;
}
