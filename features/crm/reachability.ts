/**
 * THE ONE suppression rule for the CRM.
 *
 * "May we use this contact point?" has exactly one answer, and it is computed
 * here — the call queue, the agent context on a record page, and anything that
 * proposes outreach all read the same function. It was previously inlined,
 * phone-only, inside `computeDialTargets`; a second copy for email would have
 * been the whole reason `crm.contact_medium` exists (deliverability lives on
 * the shared VALUE, not per party) quietly defeated.
 *
 * Precedence, strongest first — a record-level block beats everything, then the
 * person's own opt-out for this use, then the shared medium's state:
 *   1. the record is flagged do-not-contact
 *   2. this contact point was opted out
 *   3. the medium is on a DNC list
 *   4. the medium failed verification
 *   5. the medium is suppressed (or generated `is_contactable` says no)
 */

import type { ContactPoint, PartyRow } from "./types";

export const CONTACT_BLOCK_REASONS = [
  "party_dnc",
  "point_opted_out",
  "medium_dnc_listed",
  "medium_invalid",
  "medium_suppressed",
] as const;

export type ContactBlockReason = (typeof CONTACT_BLOCK_REASONS)[number];

/** Human copy for a block reason. One map — never restate these per surface. */
export const CONTACT_BLOCK_REASON_LABELS: Record<ContactBlockReason, string> = {
  party_dnc: "Record is do-not-contact",
  point_opted_out: "Opted out",
  medium_dnc_listed: "On a DNC list",
  medium_invalid: "Value invalid",
  medium_suppressed: "Value is suppressed",
};

/**
 * Why this contact point may not be used — `null` means it is usable.
 * Channel-agnostic: phone, email, or anything else the medium model carries.
 */
export function contactPointBlockReason(
  party: Pick<PartyRow, "do_not_contact">,
  point: ContactPoint,
): ContactBlockReason | null {
  if (party.do_not_contact) return "party_dnc";
  if (point.opt_out_at) return "point_opted_out";
  if (point.medium.dnc_state === "listed") return "medium_dnc_listed";
  if (point.medium.verification_status === "invalid") return "medium_invalid";
  if (point.medium.suppressed_at || point.medium.is_contactable === false) {
    return "medium_suppressed";
  }
  return null;
}
