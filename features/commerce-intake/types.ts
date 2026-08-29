/**
 * features/commerce-intake/types.ts
 *
 * W4 — the intake capture app over the C1 `commerce` schema (intake_batch,
 * intake_asset, intake_artifact, asset_identifier, asset_unknown), applied
 * live + certified 2026-08-29.
 *
 * Row types come directly from the generated live-database contract. The
 * narrower unions below model the CHECK-constrained values the capture UI
 * accepts; Supabase's generated Postgres types intentionally expose those
 * columns as strings.
 */

import type { Database } from "@/types/database.types";

// ── Enumerations (live CHECK constraints, verified 2026-08-29) ──────────────

export type StreamKind = "tracked_itad" | "mixed_retirement";
export type BatchCaptureMode = "serialized" | "untracked";
export type TrackingMode = "serialized" | "lot";
export type ArtifactKind = "photo" | "video" | "audio";
export type ArtifactSource = "app" | "cloud_sync" | "upload";
export type IdentifierKind =
  "our_qr" | "manufacturer_serial" | "asset_tag" | "client_ref";
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

// ── Generated row shapes ────────────────────────────────────────────────────

type CommerceTables = Database["commerce"]["Tables"];

export type IntakeBatchRow = CommerceTables["intake_batch"]["Row"];
export type IntakeAssetRow = CommerceTables["intake_asset"]["Row"];
export type IntakeArtifactRow = CommerceTables["intake_artifact"]["Row"];
export type AssetIdentifierRow = CommerceTables["asset_identifier"]["Row"];
export type AssetUnknownRow = CommerceTables["asset_unknown"]["Row"];

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
  /**
   * The asset's `metadata` jsonb, carried so writers can MERGE (capture_open,
   * the instant lane's `instant_run` pointer + `instant_analysis` record) —
   * a patch that replaces the whole column would wipe sibling keys.
   */
  metadata: Record<string, unknown>;
}

// ── The instant lane (client-run analysis; see hooks/useInstantIntakeAnalysis) ─

/**
 * THE INSTANT LANE'S DURABLE RUN POINTER — written onto
 * `intake_asset.metadata.instant_run` the moment the run's conversation
 * exists, BEFORE a single token streams, so an unmounted surface can never
 * orphan a paid run. The settled record lands beside it as
 * `metadata.instant_analysis` (the raw `electronics_intake_analysis` kind
 * object, `__kind` marker and all, saved verbatim).
 */
export interface InstantRunPointer {
  version: 1;
  conversationId: string;
  startedAt: string;
}

/** Narrow a stored `metadata.instant_run` value; null for anything unusable. */
export function readInstantRunPointer(
  data: unknown,
): InstantRunPointer | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;
  const conversationId = raw.conversationId;
  if (typeof conversationId !== "string" || conversationId.length === 0) {
    return null;
  }
  return {
    version: 1,
    conversationId,
    startedAt:
      typeof raw.startedAt === "string"
        ? raw.startedAt
        : new Date(0).toISOString(),
  };
}

/** Narrow a stored `metadata.instant_analysis` value (agent-written jsonb). */
export function readInstantResult(
  data: unknown,
): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : null;
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
