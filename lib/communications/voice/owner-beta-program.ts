/** Exact, read-only admission policy for the closed AI Matrx owner Voice beta. */

import { normalizeMediumValue } from "@/features/crm/normalize";
import type { Tables } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/adminClient";

export const VOICE_OWNER_BETA_PROGRAM_KEY = "ai_matrx_owner_beta";

type DestinationRow = Pick<
  Tables<{ schema: "communication" }, "sms_phone_numbers">,
  "id" | "phone_number" | "provider" | "provider_account_id" | "program_key"
>;

type VerifiedCallerRow = Pick<
  Tables<{ schema: "communication" }, "sms_notification_preferences">,
  "organization_id" | "phone_number" | "user_id"
>;

export interface VoiceOwnerBetaCallIdentity {
  provider: "twilio";
  providerAccountId: string;
  providerCallId: string;
  callerNumber: string;
  calledNumber: string;
  direction: string;
}

export type VoiceOwnerBetaAdmissionReason =
  | "program_not_bound"
  | "program_binding_ambiguous"
  | "provider_account_mismatch"
  | "called_number_mismatch"
  | "caller_not_verified"
  | "caller_binding_ambiguous"
  | "direction_not_inbound"
  | "invalid_phone_identity";

export type VoiceOwnerBetaAdmission =
  | {
      status: "authorized";
      programKey: typeof VOICE_OWNER_BETA_PROGRAM_KEY;
      destinationId: string;
      organizationId: string;
      userId: string;
    }
  | { status: "denied"; reason: VoiceOwnerBetaAdmissionReason };

export interface VoiceOwnerBetaProgramSnapshot {
  ready: boolean;
  programKey: typeof VOICE_OWNER_BETA_PROGRAM_KEY;
  destinationBinding: "missing" | "ambiguous" | "exact";
  verifiedCallerBinding: "missing" | "ambiguous" | "exact";
}

interface VoiceOwnerBetaCandidates {
  destinations: readonly DestinationRow[];
  verifiedCallers: readonly VerifiedCallerRow[];
}

function normalizePhone(raw: string): string | null {
  try {
    return normalizeMediumValue("phone", raw).valueKey;
  } catch {
    return null;
  }
}

/**
 * Resolve one inbound call against an exact program destination and exactly one
 * previously verified caller. The caller's phone number is never returned.
 */
export function evaluateVoiceOwnerBetaAdmission(
  call: VoiceOwnerBetaCallIdentity,
  candidates: VoiceOwnerBetaCandidates,
): VoiceOwnerBetaAdmission {
  if (candidates.destinations.length === 0) {
    return { status: "denied", reason: "program_not_bound" };
  }
  if (candidates.destinations.length !== 1) {
    return { status: "denied", reason: "program_binding_ambiguous" };
  }

  const destination = candidates.destinations[0];
  if (
    destination.provider !== call.provider ||
    destination.provider_account_id !== call.providerAccountId
  ) {
    return { status: "denied", reason: "provider_account_mismatch" };
  }
  if (call.direction !== "inbound") {
    return { status: "denied", reason: "direction_not_inbound" };
  }

  const calledNumber = normalizePhone(call.calledNumber);
  const canonicalDestination = normalizePhone(destination.phone_number);
  const callerNumber = normalizePhone(call.callerNumber);
  if (!calledNumber || !canonicalDestination || !callerNumber) {
    return { status: "denied", reason: "invalid_phone_identity" };
  }
  if (calledNumber !== canonicalDestination) {
    return { status: "denied", reason: "called_number_mismatch" };
  }

  if (candidates.verifiedCallers.length === 0) {
    return { status: "denied", reason: "caller_not_verified" };
  }
  if (candidates.verifiedCallers.length !== 1) {
    return { status: "denied", reason: "caller_binding_ambiguous" };
  }
  const verifiedCaller = candidates.verifiedCallers[0];
  const canonicalCaller = verifiedCaller.phone_number
    ? normalizePhone(verifiedCaller.phone_number)
    : null;
  if (!canonicalCaller || callerNumber !== canonicalCaller) {
    return { status: "denied", reason: "caller_not_verified" };
  }

  return {
    status: "authorized",
    programKey: VOICE_OWNER_BETA_PROGRAM_KEY,
    destinationId: destination.id,
    organizationId: verifiedCaller.organization_id,
    userId: verifiedCaller.user_id,
  };
}

function bindingState(count: number): "missing" | "ambiguous" | "exact" {
  if (count === 0) return "missing";
  return count === 1 ? "exact" : "ambiguous";
}

export function voiceOwnerBetaProgramSnapshot(
  candidates: VoiceOwnerBetaCandidates,
): VoiceOwnerBetaProgramSnapshot {
  const destinationBinding = bindingState(candidates.destinations.length);
  const verifiedCallerBinding = bindingState(candidates.verifiedCallers.length);
  return {
    ready: destinationBinding === "exact" && verifiedCallerBinding === "exact",
    programKey: VOICE_OWNER_BETA_PROGRAM_KEY,
    destinationBinding,
    verifiedCallerBinding,
  };
}

async function readVoiceOwnerBetaCandidates(): Promise<VoiceOwnerBetaCandidates> {
  const supabase = createAdminClient();
  const { data: destinations, error: destinationError } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select("id, phone_number, provider, provider_account_id, program_key")
    .eq("provider", "twilio")
    .eq("program_key", VOICE_OWNER_BETA_PROGRAM_KEY)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(2);
  if (destinationError) {
    throw new Error(`Failed to read owner Voice destination: ${destinationError.message}`);
  }
  if (!destinations) {
    throw new Error("Owner Voice destination read returned no result set");
  }
  if (destinations.length !== 1) {
    return { destinations, verifiedCallers: [] };
  }

  const destination = destinations[0];
  const { data: verifiedCallers, error: callerError } = await supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .select("organization_id, phone_number, user_id")
    .eq("assistant_destination_id", destination.id)
    .eq("assistant_program_key", VOICE_OWNER_BETA_PROGRAM_KEY)
    .not("phone_number", "is", null)
    .is("deleted_at", null)
    .limit(2);
  if (callerError) {
    throw new Error(`Failed to read verified owner Voice caller: ${callerError.message}`);
  }
  if (!verifiedCallers) {
    throw new Error("Verified owner Voice caller read returned no result set");
  }
  return { destinations, verifiedCallers };
}

/** System-webhook read only. It performs no enrollment, consent, or call writes. */
export async function authorizeVoiceOwnerBetaCall(
  call: VoiceOwnerBetaCallIdentity,
): Promise<VoiceOwnerBetaAdmission> {
  return evaluateVoiceOwnerBetaAdmission(call, await readVoiceOwnerBetaCandidates());
}

/** Secret-free readiness summary for the live Voice visibility endpoint. */
export async function inspectVoiceOwnerBetaProgram(): Promise<VoiceOwnerBetaProgramSnapshot> {
  return voiceOwnerBetaProgramSnapshot(await readVoiceOwnerBetaCandidates());
}
