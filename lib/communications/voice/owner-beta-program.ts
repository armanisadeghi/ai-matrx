/** Exact, read-only admission policy for the closed AI Matrx owner Voice beta. */

import { normalizeMediumValue } from "@/features/crm/normalize";
import type { Tables } from "@/types/database.types";
import { createAdminClient } from "@/utils/supabase/adminClient";
import {
  assistantBindingTargets,
  bindingMatchesTargets,
  successorDestinationId,
} from "@/lib/sms/assistant-line";

export const VOICE_OWNER_BETA_PROGRAM_KEY = "ai_matrx_owner_beta";

type DestinationRow = Pick<
  Tables<{ schema: "communication" }, "sms_phone_numbers">,
  "id" | "phone_number" | "provider" | "provider_account_id" | "program_key"
> & { metadata?: unknown };

type VerifiedCallerRow = Pick<
  Tables<{ schema: "communication" }, "sms_notification_preferences">,
  "phone_number"
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
    }
  | { status: "denied"; reason: VoiceOwnerBetaAdmissionReason };

export interface VoiceOwnerBetaProgramSnapshot {
  ready: boolean;
  programKey: typeof VOICE_OWNER_BETA_PROGRAM_KEY;
  destinationBinding: "missing" | "ambiguous" | "exact";
  verifiedCallerBinding: "missing" | "enrolled";
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
 * Resolve one inbound call against an exact program destination and THIS
 * caller's own verified enrollment. The caller's phone number is never
 * returned.
 *
 * PER-PARTY, NOT EXACTLY-ONE-PERSON (adjudication 2026-09-21, ruling 5).
 * This used to read up to two enrollment rows for the destination and deny
 * unless there was exactly ONE in the whole system — a rule that was
 * indistinguishable from correct while a single person was enrolled, and that
 * refuses EVERY call the moment a second person enrolls, including the owner's
 * own. The first demo would have taken voice down for him.
 *
 * `verifiedCallers` now carries only the rows matching the number that is
 * actually calling, so "exactly one" means "this number belongs to exactly one
 * account" — a genuine ambiguity worth refusing — rather than "only one person
 * in the world may use voice".
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

  // `verifiedCallers` holds only the enrollments for THIS number, so zero is
  // "you are not enrolled" and two is "two accounts claim this number" — a
  // real ambiguity we refuse rather than guess at. A hundred other people
  // being enrolled on the program affects neither branch.
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
  // ENROLLING A SECOND PERSON IS NOT AMBIGUITY. This used to run the caller
  // count through `bindingState`, so two enrolled people reported
  // "ambiguous" and the program reported NOT READY — a readiness screen that
  // turns red because the beta grew. The program is ready when its number is
  // bound and at least one person is enrolled; whether a PARTICULAR caller is
  // admitted is a per-call question this snapshot does not answer.
  const verifiedCallerBinding: VoiceOwnerBetaProgramSnapshot["verifiedCallerBinding"] =
    candidates.verifiedCallers.length === 0 ? "missing" : "enrolled";
  return {
    ready:
      destinationBinding === "exact" && verifiedCallerBinding === "enrolled",
    programKey: VOICE_OWNER_BETA_PROGRAM_KEY,
    destinationBinding,
    verifiedCallerBinding,
  };
}

async function readVoiceOwnerBetaCandidates(
  callerNumber?: string,
): Promise<VoiceOwnerBetaCandidates> {
  const supabase = createAdminClient();
  const { data: destinations, error: destinationError } = await supabase
    .schema("communication")
    .from("sms_phone_numbers")
    .select(
      "id, phone_number, provider, provider_account_id, program_key, metadata",
    )
    .eq("provider", "twilio")
    .eq("program_key", VOICE_OWNER_BETA_PROGRAM_KEY)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(2);
  if (destinationError) {
    throw new Error(
      `Failed to read owner Voice destination: ${destinationError.message}`,
    );
  }
  if (!destinations) {
    throw new Error("Owner Voice destination read returned no result set");
  }
  if (destinations.length !== 1) {
    return { destinations, verifiedCallers: [] };
  }

  const destination = destinations[0];
  // A retired staff number keeps answering the people bound to its successor
  // (lib/sms/assistant-line.ts) — the same rule the SMS ingress and
  // `communication.resolve_voice_owner_call_context` apply.
  const successorId = successorDestinationId(destination.metadata);
  let successor: { id: string; program_key: string } | null = null;
  if (successorId) {
    const { data: successorRow, error: successorError } = await supabase
      .schema("communication")
      .from("sms_phone_numbers")
      .select("id, program_key")
      .eq("id", successorId)
      .is("deleted_at", null)
      .maybeSingle();
    if (successorError) {
      throw new Error(
        `Failed to read owner Voice successor destination: ${successorError.message}`,
      );
    }
    successor = successorRow ?? null;
  }
  const bindingTargets = assistantBindingTargets(destination, successor);
  let query = supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .select("phone_number, assistant_destination_id, assistant_program_key")
    .in(
      "assistant_destination_id",
      bindingTargets.map((target) => target.destinationId),
    )
    .not("phone_number", "is", null)
    .is("deleted_at", null);

  // KEYED ON WHO IS CALLING. Without a caller the read is the readiness
  // snapshot's ("is anyone enrolled at all?"), which is capped because a
  // snapshot never needs more than the first couple of rows. With a caller it
  // is narrowed to that exact E.164 — enrollment stores the canonical form —
  // so the result set is at most the accounts claiming that one number, and it
  // does not grow as the beta grows.
  const canonicalCaller = callerNumber ? normalizePhone(callerNumber) : null;
  if (callerNumber !== undefined) {
    if (!canonicalCaller) {
      // An unparseable caller id matches no enrollment. Return none rather
      // than querying with a value that could match something by accident.
      return { destinations, verifiedCallers: [] };
    }
    query = query.eq("phone_number", canonicalCaller);
  }

  const { data: callerRows, error: callerError } = await query.limit(2);
  if (callerError) {
    throw new Error(
      `Failed to read verified owner Voice caller: ${callerError.message}`,
    );
  }
  if (!callerRows) {
    throw new Error("Verified owner Voice caller read returned no result set");
  }
  const verifiedCallers = callerRows
    .filter((row) => bindingMatchesTargets(row, bindingTargets))
    .map((row) => ({ phone_number: row.phone_number }));
  return { destinations, verifiedCallers };
}

/** System-webhook read only. It performs no enrollment, consent, or call writes. */
export async function authorizeVoiceOwnerBetaCall(
  call: VoiceOwnerBetaCallIdentity,
): Promise<VoiceOwnerBetaAdmission> {
  return evaluateVoiceOwnerBetaAdmission(
    call,
    await readVoiceOwnerBetaCandidates(call.callerNumber),
  );
}

/** Secret-free readiness summary for the live Voice status endpoint. */
export async function inspectVoiceOwnerBetaProgram(): Promise<VoiceOwnerBetaProgramSnapshot> {
  return voiceOwnerBetaProgramSnapshot(await readVoiceOwnerBetaCandidates());
}

/** Transfer is an organization-owned number setting, never agent-provided routing. */
export async function resolveVoiceOwnerBetaTransfer(
  call: VoiceOwnerBetaCallIdentity,
): Promise<string | null> {
  return evaluateVoiceOwnerBetaTransfer(
    call,
    await readVoiceOwnerBetaCandidates(call.callerNumber),
  );
}

export function evaluateVoiceOwnerBetaTransfer(
  call: VoiceOwnerBetaCallIdentity,
  candidates: VoiceOwnerBetaCandidates,
): string | null {
  if (evaluateVoiceOwnerBetaAdmission(call, candidates).status !== "authorized")
    return null;
  const metadata = candidates.destinations[0].metadata;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    !("voice_transfer_number" in metadata)
  )
    return null;
  const value = metadata.voice_transfer_number;
  return typeof value === "string" && /^\+1[2-9]\d{9}$/.test(value)
    ? value
    : null;
}
