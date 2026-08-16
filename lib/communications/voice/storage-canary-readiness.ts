/** Durable, secret-free readiness derived from the non-recording storage canary. */

import type { Tables } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import { createAdminClient } from "@/utils/supabase/adminClient";

import { VOICE_OWNER_BETA_PROGRAM_KEY } from "./owner-beta-program";

export const VOICE_STORAGE_CANARY_PASSED_ACTION =
  "voice.recording.storage_canary.passed";
export const VOICE_STORAGE_CANARY_FAILED_ACTION =
  "voice.recording.storage_canary.failed";
export const VOICE_STORAGE_CANARY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const VOICE_STORAGE_CANARY_ENTITY_TYPE = "voice_recording_storage_canary";
const VOICE_STORAGE_CANARY_EVIDENCE_VERSION = 1;
const VOICE_RECORDING_RETENTION_POLICY = "voice_recordings_30d";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const OWNER_BETA_VOICE_STORAGE_POLICY = {
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  bucket: "matrx-voice-recordings-prod-872515272894",
  allowedPrefix: "twilio/us1/owner-beta/",
  writerArn:
    "arn:aws:iam::872515272894:user/service-integrations/twilio/twilio-voice-recording-writer-prod",
} as const;

type ActivityRow = Pick<
  Tables<{ schema: "platform" }, "activity_log">,
  | "action"
  | "entity_id"
  | "entity_type"
  | "id"
  | "metadata"
  | "occurred_at"
  | "organization_id"
>;

export type VoiceStorageCanaryStatus =
  "ready" | "missing" | "failed" | "invalid" | "stale";

export interface VoiceStorageCanaryReadiness {
  ready: boolean;
  status: VoiceStorageCanaryStatus;
  evidenceId: number | null;
  completedAt: string | null;
  validUntil: string | null;
}

function unavailable(
  status: Exclude<VoiceStorageCanaryStatus, "ready">,
  row: ActivityRow | null,
  completedAt: string | null = null,
): VoiceStorageCanaryReadiness {
  return {
    ready: false,
    status,
    evidenceId: row?.id ?? null,
    completedAt,
    validUntil: null,
  };
}

function isTrue(metadata: Record<string, unknown>, key: string): boolean {
  return metadata[key] === true;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/**
 * Validate the latest activity receipt against the exact checked-in storage
 * boundary. Credential identifiers and object paths are deliberately omitted
 * from the returned visibility model.
 */
export function evaluateVoiceStorageCanaryReceipt(
  row: ActivityRow | null,
  now: Date = new Date(),
): VoiceStorageCanaryReadiness {
  if (row === null) return unavailable("missing", null);
  if (
    row.organization_id !== OWNER_BETA_VOICE_STORAGE_POLICY.organizationId ||
    row.entity_type !== VOICE_STORAGE_CANARY_ENTITY_TYPE ||
    !isJsonObject(row.metadata)
  ) {
    return unavailable("invalid", row);
  }
  if (row.action === VOICE_STORAGE_CANARY_FAILED_ACTION) {
    return unavailable("failed", row);
  }
  if (row.action !== VOICE_STORAGE_CANARY_PASSED_ACTION) {
    return unavailable("invalid", row);
  }

  const metadata = row.metadata;
  const completedAt =
    typeof metadata.completed_at === "string" ? metadata.completed_at : null;
  const completedAtMs =
    completedAt === null ? Number.NaN : Date.parse(completedAt);
  const factsMatch =
    metadata.evidence_version === VOICE_STORAGE_CANARY_EVIDENCE_VERSION &&
    metadata.program_key === VOICE_OWNER_BETA_PROGRAM_KEY &&
    metadata.bucket === OWNER_BETA_VOICE_STORAGE_POLICY.bucket &&
    metadata.allowed_prefix === OWNER_BETA_VOICE_STORAGE_POLICY.allowedPrefix &&
    metadata.expected_writer_arn ===
      OWNER_BETA_VOICE_STORAGE_POLICY.writerArn &&
    metadata.writer_arn === OWNER_BETA_VOICE_STORAGE_POLICY.writerArn &&
    metadata.retention_policy === VOICE_RECORDING_RETENTION_POLICY &&
    isUuid(row.entity_id) &&
    metadata.run_id === row.entity_id &&
    isHash(metadata.writer_principal_id_hash) &&
    isHash(metadata.writer_credential_fingerprint) &&
    isHash(metadata.object_key_hash) &&
    isHash(metadata.sentinel_sha256) &&
    isUuid(metadata.custody_receipt_id) &&
    isUuid(metadata.adoption_receipt_id) &&
    isUuid(metadata.read_receipt_id) &&
    isUuid(metadata.delete_receipt_id) &&
    isTrue(metadata, "writer_identity_exact") &&
    isTrue(metadata, "writer_put_succeeded") &&
    isTrue(metadata, "writer_read_denied") &&
    isTrue(metadata, "writer_delete_denied") &&
    isTrue(metadata, "writer_outside_prefix_put_denied") &&
    isTrue(metadata, "writer_object_list_denied") &&
    isTrue(metadata, "application_head_read_hash_succeeded") &&
    isTrue(metadata, "canonical_file_indexed") &&
    isTrue(metadata, "canonical_file_deleted") &&
    Number.isFinite(completedAtMs);
  if (!factsMatch) return unavailable("invalid", row, completedAt);

  const ageMs = now.getTime() - completedAtMs;
  if (ageMs < -5 * 60 * 1000) {
    return unavailable("invalid", row, completedAt);
  }
  if (ageMs > VOICE_STORAGE_CANARY_MAX_AGE_MS) {
    return unavailable("stale", row, completedAt);
  }
  return {
    ready: true,
    status: "ready",
    evidenceId: row.id,
    completedAt,
    validUntil: new Date(
      completedAtMs + VOICE_STORAGE_CANARY_MAX_AGE_MS,
    ).toISOString(),
  };
}

/** Read and evaluate the latest owner-beta storage-canary outcome. */
export async function getVoiceStorageCanaryReadiness(): Promise<VoiceStorageCanaryReadiness> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("activity_log")
    .select(
      "action, entity_id, entity_type, id, metadata, occurred_at, organization_id",
    )
    .eq("organization_id", OWNER_BETA_VOICE_STORAGE_POLICY.organizationId)
    .eq("entity_type", VOICE_STORAGE_CANARY_ENTITY_TYPE)
    .in("action", [
      VOICE_STORAGE_CANARY_PASSED_ACTION,
      VOICE_STORAGE_CANARY_FAILED_ACTION,
    ])
    .contains("metadata", { program_key: VOICE_OWNER_BETA_PROGRAM_KEY })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(
      `Failed to read Voice storage canary evidence: ${error.message}`,
    );
  }
  return evaluateVoiceStorageCanaryReceipt(data?.[0] ?? null);
}
