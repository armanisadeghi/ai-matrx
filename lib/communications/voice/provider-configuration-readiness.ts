/** Durable, secret-free readiness derived from exact operator-verified provider configuration. */

import type { Tables } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import { createAdminClient } from "@/utils/supabase/adminClient";

import { VOICE_OWNER_BETA_PROGRAM_KEY } from "./owner-beta-program";
// THE strict RFC-4122 predicate. This door had its own copy, allowlisted in
// the twin register on 2026-09-07 because the package only shipped a LAX one;
// kit now ships both under names that say which is which, so the allowlist
// entry is gone. One deliberate widening: the local regex was case-SENSITIVE
// and this one is not — RFC-4122 hex may be either case, and an uppercase id
// this system minted was being refused.
import { parseTimestamp } from "@ai-matrx/kit/format";
import { isRfc4122Uuid } from "@ai-matrx/kit/uuid";

export const VOICE_PROVIDER_CONFIGURATION_VERIFIED_ACTION =
  "voice.recording.provider_configuration.verified";
export const VOICE_PROVIDER_CONFIGURATION_INVALIDATED_ACTION =
  "voice.recording.provider_configuration.invalidated";
const VOICE_PROVIDER_CONFIGURATION_ENTITY_TYPE =
  "voice_recording_provider_configuration";
const VOICE_PROVIDER_CONFIGURATION_EVIDENCE_VERSION = 1;
const ALLOWED_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY = {
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  operatorId: "4cf62e4e-2679-484f-b652-034e697418df",
  provider: "twilio",
  providerAccountFingerprint:
    "14cfe09cca6aa464561b63a988c50570265a916bc5932648a3e0a424dd2b6867",
  providerRegion: "US1",
  storageCredentialFingerprint:
    "f7fc81f7ac8f75a1ee497b48b369085e09d9ea5861177e438fce287e57ec6561",
  externalStorageUrl:
    "https://matrx-voice-recordings-prod-872515272894.s3.us-east-1.amazonaws.com/twilio/us1/owner-beta",
} as const;

type ActivityRow = Pick<
  Tables<{ schema: "platform" }, "activity_log">,
  | "action"
  | "actor_id"
  | "entity_id"
  | "entity_type"
  | "id"
  | "metadata"
  | "occurred_at"
  | "organization_id"
>;

export type VoiceProviderConfigurationStatus =
  "ready" | "missing" | "invalidated" | "invalid";

export interface VoiceProviderConfigurationReadiness {
  ready: boolean;
  status: VoiceProviderConfigurationStatus;
  evidenceId: number | null;
  verifiedAt: string | null;
  providerAccountVerified: boolean;
  externalStorageConfigured: boolean;
}

function unavailable(
  status: Exclude<VoiceProviderConfigurationStatus, "ready">,
  row: ActivityRow | null,
  verifiedAt: string | null = null,
): VoiceProviderConfigurationReadiness {
  return {
    ready: false,
    status,
    evidenceId: row?.id ?? null,
    verifiedAt,
    providerAccountVerified: false,
    externalStorageConfigured: false,
  };
}

/**
 * A receipt timestamp as BOTH the stored string and its instant — the
 * comparison needs the number and the visibility result echoes the string.
 *
 * The parsing is `@ai-matrx/kit/format`'s, not a bare `Date.parse`: a
 * zone-less `timestamp without time zone` reaching this door was being read as
 * the SERVER's local time, so a receipt could be judged current or expired by
 * the process timezone. Same correction the whole fleet inherited on
 * 2026-09-07.
 */
function receiptInstant(
  value: unknown,
): { iso: string; milliseconds: number } | null {
  if (typeof value !== "string") return null;
  const parsed = parseTimestamp(value);
  if (!parsed) return null;
  return { iso: value, milliseconds: parsed.getTime() };
}

/**
 * Validate a reviewed provider receipt against the exact owner-beta account,
 * region, credential identity, and external-storage target. The visibility
 * result deliberately omits all provider and storage identifiers.
 */
export function evaluateVoiceProviderConfigurationReceipt(
  row: ActivityRow | null,
  now: Date = new Date(),
): VoiceProviderConfigurationReadiness {
  if (row === null) return unavailable("missing", null);
  if (
    row.organization_id !==
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.organizationId ||
    row.actor_id !==
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.operatorId ||
    row.entity_type !== VOICE_PROVIDER_CONFIGURATION_ENTITY_TYPE ||
    !isJsonObject(row.metadata)
  ) {
    return unavailable("invalid", row);
  }
  if (row.action === VOICE_PROVIDER_CONFIGURATION_INVALIDATED_ACTION) {
    return unavailable("invalidated", row);
  }
  if (row.action !== VOICE_PROVIDER_CONFIGURATION_VERIFIED_ACTION) {
    return unavailable("invalid", row);
  }

  const metadata = row.metadata;
  const emailVerifiedAt = receiptInstant(
    metadata.email_verification_completed_at,
  );
  const configurationVerifiedAt = receiptInstant(
    metadata.configuration_verified_at,
  );
  const factsMatch =
    metadata.evidence_version ===
      VOICE_PROVIDER_CONFIGURATION_EVIDENCE_VERSION &&
    metadata.program_key === VOICE_OWNER_BETA_PROGRAM_KEY &&
    metadata.provider ===
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.provider &&
    metadata.provider_account_fingerprint ===
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.providerAccountFingerprint &&
    metadata.provider_region ===
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.providerRegion &&
    metadata.storage_credential_fingerprint ===
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.storageCredentialFingerprint &&
    metadata.external_storage_url ===
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.externalStorageUrl &&
    metadata.email_verification_completed === true &&
    metadata.external_storage_enabled === true &&
    metadata.recording_capture_enabled === false &&
    isRfc4122Uuid(row.entity_id) &&
    metadata.verification_id === row.entity_id &&
    emailVerifiedAt !== null &&
    configurationVerifiedAt !== null &&
    configurationVerifiedAt.milliseconds >= emailVerifiedAt.milliseconds;
  if (
    !factsMatch ||
    emailVerifiedAt === null ||
    configurationVerifiedAt === null
  ) {
    return unavailable("invalid", row, configurationVerifiedAt?.iso ?? null);
  }

  const nowMs = now.getTime();
  if (
    emailVerifiedAt.milliseconds > nowMs + ALLOWED_FUTURE_SKEW_MS ||
    configurationVerifiedAt.milliseconds > nowMs + ALLOWED_FUTURE_SKEW_MS
  ) {
    return unavailable("invalid", row, configurationVerifiedAt.iso);
  }

  return {
    ready: true,
    status: "ready",
    evidenceId: row.id,
    verifiedAt: configurationVerifiedAt.iso,
    providerAccountVerified: true,
    externalStorageConfigured: true,
  };
}

/** Read and evaluate the latest owner-beta provider-configuration receipt. */
export async function getVoiceProviderConfigurationReadiness(): Promise<VoiceProviderConfigurationReadiness> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("activity_log")
    .select(
      "action, actor_id, entity_id, entity_type, id, metadata, occurred_at, organization_id",
    )
    .eq(
      "organization_id",
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.organizationId,
    )
    .eq("entity_type", VOICE_PROVIDER_CONFIGURATION_ENTITY_TYPE)
    .in("action", [
      VOICE_PROVIDER_CONFIGURATION_VERIFIED_ACTION,
      VOICE_PROVIDER_CONFIGURATION_INVALIDATED_ACTION,
    ])
    .contains("metadata", { program_key: VOICE_OWNER_BETA_PROGRAM_KEY })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(
      `Failed to read Voice provider configuration evidence: ${error.message}`,
    );
  }
  return evaluateVoiceProviderConfigurationReceipt(data?.[0] ?? null);
}
