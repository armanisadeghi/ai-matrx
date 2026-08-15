/** Durable server-only persistence for provider-neutral voice lifecycle evidence. */

import "server-only";

import type { Database } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type { CallLifecycleEvent } from "./lifecycle";
import type { CallRecordingLifecycleEvent } from "./recording-lifecycle";
import type { CallConsentEvidence } from "./consent";

type CommunicationFunctions = Database["communication"]["Functions"];

export type VoiceCallLifecycleClaim =
  CommunicationFunctions["claim_voice_call_lifecycle_event"]["Returns"][number];
export type VoiceRecordingLifecycleClaim =
  CommunicationFunctions["claim_voice_recording_lifecycle_event"]["Returns"][number];
export type VoiceCallRegistration =
  CommunicationFunctions["register_voice_call_interaction"]["Returns"][number];
export type VoiceOwnerCallContext =
  CommunicationFunctions["resolve_voice_owner_call_context"]["Returns"][number];
export type VoiceCallConsentClaim =
  CommunicationFunctions["claim_voice_call_consent_event"]["Returns"][number];
export type VoiceCallConsentPersistenceReadiness =
  CommunicationFunctions["voice_call_consent_persistence_readiness"]["Returns"][number];
export type VoiceRecordingFileFinalization =
  CommunicationFunctions["finalize_voice_recording_file"]["Returns"][number];
export type VoiceRecordingPersistenceReadiness =
  CommunicationFunctions["voice_recording_persistence_readiness"]["Returns"][number];

export class VoicePersistenceError extends Error {
  constructor(
    message: string,
    readonly databaseCode: string | null,
  ) {
    super(message);
    this.name = "VoicePersistenceError";
  }
}

function requireSingleRow<T>(
  operation: string,
  rows: T[] | null,
  error: { code?: string; message: string } | null,
): T {
  if (error) {
    throw new VoicePersistenceError(
      `${operation} failed: ${error.message}`,
      error.code ?? null,
    );
  }
  if (!rows || rows.length !== 1) {
    throw new VoicePersistenceError(
      `${operation} did not return exactly one durable result`,
      null,
    );
  }
  return rows[0];
}

export interface RegisterVoiceCallInput {
  partyId: string;
  contactPointId: string;
  organizationId: string;
  recordingOwnerId: string;
  direction: "inbound" | "outbound";
  provider: "twilio";
  providerAccountId: string;
  providerCallId: string;
  programKey: string;
  fromAddress: string;
  toAddress: string;
  occurredAt: string | null;
}

export interface ResolveVoiceOwnerCallContextInput {
  programKey: string;
  destinationId: string;
  provider: "twilio";
  providerAccountId: string;
  callerPhone: string;
  calledPhone: string;
}

/**
 * Resolve only an already-enrolled caller to one verified phone point on one
 * pre-existing person in the normal AI Matrx CRM tenant.
 */
export async function resolveVoiceOwnerCallContext(
  input: ResolveVoiceOwnerCallContextInput,
): Promise<VoiceOwnerCallContext> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("resolve_voice_owner_call_context", {
      p_program_key: input.programKey,
      p_destination_id: input.destinationId,
      p_provider: input.provider,
      p_provider_account_id: input.providerAccountId,
      p_caller_phone: input.callerPhone,
      p_called_phone: input.calledPhone,
    });
  return requireSingleRow("Voice owner call context resolution", data, error);
}

/** Register the one canonical CRM interaction before accepting lifecycle callbacks. */
export async function registerVoiceCallInteraction(
  input: RegisterVoiceCallInput,
): Promise<VoiceCallRegistration> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("register_voice_call_interaction", {
      p_party_id: input.partyId,
      p_contact_point_id: input.contactPointId,
      p_organization_id: input.organizationId,
      p_recording_owner_id: input.recordingOwnerId,
      p_direction: input.direction,
      p_provider: input.provider,
      p_provider_account_id: input.providerAccountId,
      p_provider_call_id: input.providerCallId,
      p_program_key: input.programKey,
      p_from_address: input.fromAddress,
      p_to_address: input.toAddress,
      p_occurred_at: input.occurredAt ?? undefined,
    });
  return requireSingleRow("Voice call registration", data, error);
}

/** Atomically append and apply one signed provider call lifecycle event. */
export async function claimVoiceCallLifecycleEvent(
  event: CallLifecycleEvent,
): Promise<VoiceCallLifecycleClaim> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("claim_voice_call_lifecycle_event", {
      p_provider: event.provider,
      p_provider_account_id: event.providerAccountId,
      p_provider_call_id: event.providerCallId,
      p_provider_event_key: event.providerEventKey,
      p_sequence: event.sequence,
      p_status: event.status,
      p_occurred_at: event.occurredAt ?? undefined,
    });
  return requireSingleRow("Voice call lifecycle claim", data, error);
}

/** Persist one affirmative consent event before returning continuation TwiML. */
export async function claimVoiceCallConsentEvent(
  evidence: CallConsentEvidence,
): Promise<VoiceCallConsentClaim> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("claim_voice_call_consent_event", {
      p_provider: evidence.provider,
      p_provider_account_id: evidence.providerAccountId,
      p_provider_call_id: evidence.providerCallId,
      p_provider_event_key: evidence.providerEventKey,
      p_program_key: evidence.programKey,
      p_disclosure_version: evidence.disclosureVersion,
      p_disclosure_text_hash: evidence.disclosureTextHash,
      p_disclosed_at: evidence.disclosedAt,
      p_response_kind: evidence.responseKind,
      p_response_value: evidence.responseValue,
      p_consented_at: evidence.consentedAt,
      p_source: evidence.source,
    });
  return requireSingleRow("Voice call consent claim", data, error);
}

/** Atomically append and apply one signed provider recording lifecycle event. */
export async function claimVoiceRecordingLifecycleEvent(
  event: CallRecordingLifecycleEvent,
): Promise<VoiceRecordingLifecycleClaim> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("claim_voice_recording_lifecycle_event", {
      p_provider: event.provider,
      p_provider_account_id: event.providerAccountId,
      p_provider_call_id: event.providerCallId,
      p_provider_recording_id: event.providerRecordingId,
      p_provider_event_key: event.providerEventKey,
      p_status: event.status,
      p_recording_started_at: event.occurredAt ?? undefined,
      p_duration_seconds: event.durationSeconds ?? undefined,
      p_channels: event.channels ?? undefined,
      p_source: event.source ?? undefined,
      p_track: event.track ?? undefined,
      p_provider_media_url: event.providerMediaUrl ?? undefined,
    });
  return requireSingleRow("Voice recording lifecycle claim", data, error);
}

export interface FinalizeVoiceRecordingFileInput {
  provider: "twilio";
  providerAccountId: string;
  providerCallId: string;
  providerRecordingId: string;
  sourceEventKey: string;
  fileId: string;
}

/** Bind an adopted canonical file only to its exact completed provider evidence. */
export async function finalizeVoiceRecordingFile(
  input: FinalizeVoiceRecordingFileInput,
): Promise<VoiceRecordingFileFinalization> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("finalize_voice_recording_file", {
      p_provider: input.provider,
      p_provider_account_id: input.providerAccountId,
      p_provider_call_id: input.providerCallId,
      p_provider_recording_id: input.providerRecordingId,
      p_source_event_key: input.sourceEventKey,
      p_file_id: input.fileId,
    });
  return requireSingleRow("Voice recording file finalization", data, error);
}

/** Read the actual installed schema/index/RPC and live ambiguity/URL gates. */
export async function getVoiceRecordingPersistenceReadiness(): Promise<VoiceRecordingPersistenceReadiness> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("voice_recording_persistence_readiness");
  return requireSingleRow("Voice recording persistence readiness", data, error);
}

/** Read the installed resolver, registration, consent ledger, and identity gates. */
export async function getVoiceCallConsentPersistenceReadiness(): Promise<VoiceCallConsentPersistenceReadiness> {
  const { data, error } = await createAdminClient()
    .schema("communication")
    .rpc("voice_call_consent_persistence_readiness");
  return requireSingleRow("Voice call consent persistence readiness", data, error);
}

export function voicePersistenceHttpStatus(error: unknown): number {
  if (!(error instanceof VoicePersistenceError)) return 500;
  if (error.databaseCode === "22023") return 400;
  return error.databaseCode === "P0002" ||
    error.databaseCode === "23503" ||
    error.databaseCode === "23505" ||
    error.databaseCode === "42501" ||
    error.databaseCode === "55000"
    ? 409
    : 500;
}
