/**
 * features/commerce-intake/types.ts
 *
 * W4 — the intake capture app over the C1 `commerce` schema (intake_batch,
 * intake_asset, intake_artifact, asset_identifier, asset_unknown), applied
 * live + certified 2026-08-29.
 *
 * TYPING NOTE: `commerce` is not yet in the generated
 * `types/database.types.ts` (the `db-types` script's schema list does not
 * include it, and this container cannot run `pnpm db-types`), so the rows
 * are hand-declared here against the LIVE columns (verified via
 * information_schema 2026-08-29) and the client is cast through
 * `CommerceIntakeSchema` — the same pattern as the vision-interview
 * `InterviewSchema`. When `commerce` lands in the generated types, delete
 * these row declarations and project from `Database["commerce"]`.
 */

import type { Json } from "@/types/database.types";

// ── Enumerations (live CHECK constraints, verified 2026-08-29) ──────────────

export type StreamKind = "tracked_itad" | "mixed_retirement";
export type BatchCaptureMode = "serialized" | "untracked";
export type TrackingMode = "serialized" | "lot";
export type ArtifactKind = "photo" | "video" | "audio";
export type ArtifactSource = "app" | "cloud_sync" | "upload";
export type IdentifierKind =
  | "our_qr"
  | "manufacturer_serial"
  | "asset_tag"
  | "client_ref";
export type QuestionKind = "text" | "choice" | "boolean";
export type Composition = "single" | "lot" | "mixed";
export type PipelineState =
  | "captured"
  | "extracting"
  | "grouped"
  | "researching"
  | "valuing"
  | "awaiting_triage"
  | "awaiting_grading"
  | "awaiting_info"
  | "awaiting_reshoot"
  | "drafting"
  | "in_review"
  | "awaiting_finish"
  | "ready_to_publish"
  | "published"
  | "recycled"
  | "rejected";

// ── Row shapes (live columns) ───────────────────────────────────────────────

export interface IntakeBatchRow {
  id: string;
  client_party_id: string | null;
  stream_kind: StreamKind;
  label: string | null;
  received_at: string | null;
  capture_mode: BatchCaptureMode;
  grading_standard: string;
  status: string;
  notes: string | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  metadata: Json;
  visibility: string;
}

export interface IntakeAssetRow {
  id: string;
  intake_batch_id: string;
  product_id: string | null;
  tracking_mode: TrackingMode;
  quantity: number;
  parent_asset_id: string | null;
  split_dimension: string | null;
  attributes: Json;
  pipeline_state: PipelineState;
  value_bucket: string | null;
  is_gem_candidate: boolean;
  estimated_value: number | null;
  estimated_value_currency: string | null;
  grading_standard: string | null;
  blocked_reason: string | null;
  promoted_at: string | null;
  notes: string | null;
  featured_artifact_id: string | null;
  composition: Composition | null;
  composition_confidence: number | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  metadata: Json;
}

export interface IntakeArtifactRow {
  id: string;
  intake_batch_id: string;
  intake_asset_id: string | null;
  file_id: string | null;
  artifact_kind: ArtifactKind;
  source: ArtifactSource;
  cloud_sync_connection_id: string | null;
  original_path: string | null;
  captured_at: string | null;
  sequence_index: number | null;
  shot_role: string | null;
  is_delineator: boolean;
  content_hash: string | null;
  duration_ms: number | null;
  /** Filled asynchronously by the pipeline — the capture app NEVER writes it. */
  transcript: string | null;
  transcribed_at: string | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  metadata: Json;
}

export interface AssetIdentifierRow {
  id: string;
  intake_asset_id: string;
  identifier_kind: IdentifierKind;
  value: string;
  is_primary: boolean;
  is_machine_readable: boolean;
  replaced_at: string | null;
  replaced_reason: string | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  metadata: Json;
}

export interface AssetUnknownRow {
  id: string;
  intake_asset_id: string;
  question: string;
  question_kind: QuestionKind;
  options: Json | null;
  raised_by: "agent" | "human";
  field_key: string | null;
  value_impact: "high" | "medium" | "low" | null;
  resolution_method: string | null;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  answer_source: string | null;
  skip_count: number;
  deferred_at: string | null;
  deferred_reason: string | null;
  priority: number;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  metadata: Json;
}

// ── Supabase schema shape for the commerceDb helper ─────────────────────────

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface CommerceIntakeSchema {
  Tables: {
    intake_batch: TableShape<IntakeBatchRow>;
    intake_asset: TableShape<IntakeAssetRow>;
    intake_artifact: TableShape<IntakeArtifactRow>;
    asset_identifier: TableShape<AssetIdentifierRow>;
    asset_unknown: TableShape<AssetUnknownRow>;
  };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
}

// ── UI shapes ───────────────────────────────────────────────────────────────

/** The batch as the session holds it. */
export interface IntakeBatch {
  id: string;
  organizationId: string;
  streamKind: StreamKind;
  captureMode: BatchCaptureMode;
  label: string | null;
  status: string;
  notes: string | null;
  version: number;
}

/** The asset as the capture UI holds it (version carried for CAS writes). */
export interface IntakeAsset {
  id: string;
  batchId: string;
  organizationId: string;
  trackingMode: TrackingMode;
  quantity: number;
  pipelineState: PipelineState;
  notes: string;
  attributes: Record<string, string>;
  featuredArtifactId: string | null;
  composition: Composition | null;
  createdAt: string;
  version: number;
  /** Primary our_qr value, joined from asset_identifier (null = untracked). */
  qrCode: string | null;
}

/** One stored artifact link as the UI lists it. */
export interface IntakeArtifact {
  id: string;
  batchId: string;
  assetId: string | null;
  fileId: string | null;
  kind: ArtifactKind;
  sequenceIndex: number | null;
  isDelineator: boolean;
  createdAt: string;
}

export interface AssetIdentifier {
  id: string;
  assetId: string;
  kind: IdentifierKind;
  value: string;
  isPrimary: boolean;
  replacedAt: string | null;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

/** One open question of the answer queue. */
export interface AssetQuestion {
  id: string;
  assetId: string;
  prompt: string;
  kind: QuestionKind;
  options: ChoiceOption[];
  valueImpact: "high" | "medium" | "low" | null;
  skipCount: number;
  priority: number;
  createdAt: string;
  version: number;
}

/** A locally tracked artifact for the capture filmstrip (upload state). */
export interface PendingIntakeArtifact {
  localId: string;
  /** Asset the artifact belongs to; null = batch-level (untracked mode). */
  assetId: string | null;
  kind: ArtifactKind;
  isDelineator: boolean;
  previewUrl?: string;
  fileId?: string;
  artifactId?: string;
  status: "uploading" | "uploaded" | "error";
  error?: string;
}
