"use client";

// features/mandates/admin/promotion.ts
//
// THE MANDATE PROMOTION DOOR, client side.
//
// `mandate.duplicate_mandate(p_mandate_id, p_as_system, p_organization_id)`
// (aidream 0592) is the single place a browser may copy a mandate. It is
// SECURITY DEFINER and granted to `authenticated`, so THE BODY IS THE GATE —
// exactly the `agx_duplicate_agent` precedent this campaign's L3 row names
// (REVIEW-one-resolution.md §8b item 3). Nothing here re-implements a rule:
//
//   · super-admin only, on the p_as_system branch    — checked in the body
//   · the copy is homed in the Matrx System org      — decided in the body,
//     from `iam.system_orgs` key='system', never a literal uuid in a bundle
//   · the copy's holder must be a SYSTEM agent       — THE HOLDER LAW, in the
//     body, refusing with the agent promotion door named
//   · the copy starts with NO RUNGS                  — no binding is carried
//
// The `isSuperAdmin` gate on the button is chrome: it decides whether to OFFER
// the control, never whether the promotion is allowed. A screen is absent or
// honest — so when the door refuses anyway, its sentence is what the person
// reads, verbatim.

import { createClient } from "@/utils/supabase/client";
import { MandateDoorError } from "@/features/mandates/door-error";
import { invalidateMandateCache } from "@/features/mandates/service";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";

/** A refusal or failure from the promotion door, in the database's own words. */
export class MandatePromotionError extends MandateDoorError {
  constructor(init: {
    message: string;
    code?: string | null;
    detail?: string | null;
    hint?: string | null;
  }) {
    super({
      ...init,
      name: "MandatePromotionError",
      fallback:
        "The promotion door returned an error with no message — usually a gateway/PostgREST failure rather than a query error.",
    });
  }
}

export interface PromotedMandate {
  id: string;
  mandateKey: string;
  label: string;
}

/**
 * Promote a mandate: copy it into the Matrx System organization, with lineage.
 *
 * Returns the copy's identity so the caller can hand the admin a door to it —
 * a promotion the admin cannot reach is a dead end. The id comes back from the
 * RPC (its contract, mirroring `agx_duplicate_agent` and
 * `wfx_duplicate_definition`); the key and label are read back so the screen
 * can say WHICH copy it made rather than guessing at the suffix rule.
 */
export async function promoteMandateToSystem(
  mandateId: string,
): Promise<PromotedMandate> {
  const supabase = createClient();
  const { data: newId, error } = await supabase
    .schema("mandate")
    .rpc("duplicate_mandate", {
      p_mandate_id: mandateId,
      p_as_system: true,
    });

  if (error) {
    throw new MandatePromotionError({
      message: error.message,
      code: error.code,
      detail: error.details,
      hint: error.hint,
    });
  }
  if (!newId) {
    throw new MandatePromotionError({
      message: "The promotion door returned no mandate, so nothing was copied.",
    });
  }

  const { data: created, error: readError } = await mandateDefinitions(supabase)
    .select("id, mandate_key, label")
    .eq("id", newId)
    .maybeSingle();
  if (readError) {
    throw new MandatePromotionError({
      message: readError.message,
      code: readError.code,
      detail: readError.details,
      hint: readError.hint,
    });
  }
  if (!created) {
    throw new MandatePromotionError({
      message:
        "The system mandate was created, but it could not be read back — open the system home of the mandate list to find it.",
    });
  }

  // Every mandate reader listens to this bus; a promotion adds a row to the
  // system corpus, so a console left open must not keep showing the old one.
  invalidateMandateCache();

  return {
    id: created.id,
    mandateKey: created.mandate_key,
    label: created.label,
  };
}
