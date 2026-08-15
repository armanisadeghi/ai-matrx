// features/crm/compliance/service.ts
//
// Client-side reads/writes for the outreach compliance system. Direct to
// Supabase, per the data-flow rule — none of this is compute, so none of it goes
// through Python.
//
// 🚨 The eligibility answers here come from crm.check_send_eligibility via the
// public wrapper. Do NOT reimplement any of its checks in TypeScript: a preview
// that disagrees with the gate is worse than no preview, and the gate is what
// actually refuses the send.
//
// System-of-record: /Users/armanisadeghi/code/common-docs/systems/outreach-compliance/

import { isJsonObject } from "@/types/json";
import { createClient } from "@/utils/supabase/client";
import { parseEligibilityVerdict } from "./parse";
import {
  OUTREACH_POLICY_VERSION,
  type EligibilityVerdict,
  type OutreachLane,
} from "./types";

/**
 * Ask the ONE authority whether this recipient may be sent to right now.
 *
 * Throws on a real failure rather than returning "allowed" — a compliance check
 * that fails open is the entire class of bug this system exists to prevent.
 */
export async function checkSendEligibility(params: {
  mediumId: string;
  listId?: string | null;
  identityId?: string | null;
}): Promise<EligibilityVerdict> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("crm_check_send_eligibility", {
    p_medium_id: params.mediumId,
    p_list_id: params.listId ?? undefined,
    p_identity_id: params.identityId ?? undefined,
  });

  if (error) {
    throw new Error(`Eligibility check failed: ${error.message}`);
  }
  if (!data) {
    throw new Error("Eligibility check returned no verdict");
  }
  // Narrowed at runtime, not cast: a verdict whose shape we merely asserted
  // would fail open the day the DB function changes.
  return parseEligibilityVerdict(data);
}

/**
 * Batch preview for a campaign screen: "23 of 140 recipients cannot be
 * contacted, and here is why."
 *
 * Sequential on purpose — this is a preview, not a send path, and hammering the
 * DB with 140 parallel RPCs to render a summary is the waste the efficiency rule
 * exists to prevent. Callers should page.
 */
export async function checkSendEligibilityBatch(params: {
  mediumIds: string[];
  listId?: string | null;
  identityId?: string | null;
}): Promise<Map<string, EligibilityVerdict>> {
  const results = new Map<string, EligibilityVerdict>();
  for (const mediumId of params.mediumIds) {
    results.set(
      mediumId,
      await checkSendEligibility({
        mediumId,
        listId: params.listId,
        identityId: params.identityId,
      }),
    );
  }
  return results;
}

/** Every country we know about, with the verdict and the condition. */
export async function listJurisdictionPolicies() {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("jurisdiction_policy")
    .select(
      "country_code, country_name, region, cold_b2b, cold_b2c, conditions, " +
        "requires_role_relevance, requires_source_disclosure, " +
        "distinguishes_subscriber_kind, citation, ratified_by, ratified_at, notes",
    )
    .eq("is_active", true)
    .order("country_name");

  if (error) throw new Error(`Could not load jurisdictions: ${error.message}`);
  return data ?? [];
}

/**
 * Record that this org accepted the sending rules for a lane.
 *
 * Append-only by RLS: there is no update path, because rewriting what you agreed
 * to would defeat the point of recording it.
 */
export async function acceptOutreachPolicy(params: {
  organizationId: string;
  lane: OutreachLane;
  acceptedText: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("You must be signed in to accept the sending rules.");
  }

  const { error } = await supabase
    .schema("crm")
    .from("outreach_acceptance")
    .insert({
      organization_id: params.organizationId,
      lane: params.lane,
      policy_version: OUTREACH_POLICY_VERSION,
      accepted_by: userData.user.id,
      accepted_text: params.acceptedText,
      user_agent:
        typeof navigator === "undefined" ? null : navigator.userAgent,
    });

  // A duplicate acceptance of the same version is success, not an error — the
  // unique index is there to keep one row per version, not to punish a re-click.
  if (error && error.code !== "23505") {
    throw new Error(`Could not record acceptance: ${error.message}`);
  }
}

/** Has this org accepted the current policy version for this lane? */
export async function hasAcceptedOutreachPolicy(params: {
  organizationId: string;
  lane: OutreachLane;
}): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("outreach_acceptance")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("lane", params.lane)
    .limit(1);

  if (error) throw new Error(`Could not read acceptance: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Mint (or reuse) the permanent unsubscribe token for a recipient.
 *
 * Idempotent in the DB — the same (medium, list) always returns the same token,
 * so a follow-up message carries the link the recipient may already hold.
 */
export async function issueUnsubscribeToken(params: {
  mediumId: string;
  listId?: string | null;
  identityId?: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("crm")
    .rpc("issue_unsubscribe_token", {
      p_contact_medium_id: params.mediumId,
      p_outreach_list_id: params.listId ?? undefined,
      p_sending_identity_id: params.identityId ?? undefined,
    });

  if (error) throw new Error(`Could not create unsubscribe link: ${error.message}`);
  if (!data) throw new Error("Unsubscribe link was not created");
  return data;
}

/**
 * Lift a circuit-breaker pause. Org admins only, and the DB enforces that —
 * the system pauses, a human resumes, never the reverse.
 */
export async function resumeSendingIdentity(params: {
  identityId: string;
  note?: string;
}): Promise<{ ok: boolean; error?: string; status?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("crm_resume_sending_identity", {
    p_identity_id: params.identityId,
    p_note: params.note ?? undefined,
  });

  if (error) throw new Error(`Could not resume sending: ${error.message}`);

  // Narrowed, not cast — same reason as the verdict above.
  if (!isJsonObject(data)) return { ok: false, error: "no_result" };
  return {
    ok: data.ok === true,
    error: typeof data.error === "string" ? data.error : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}
