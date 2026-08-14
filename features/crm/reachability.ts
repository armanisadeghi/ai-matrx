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

import type { ContactMediumRow, ContactPoint, PartyRow } from "./types";

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

// ── What blocks a VALUE, and which half of it we may undo ───────────────────
//
// THE REVERSIBILITY RULE. "Do not call" writes exactly two things:
// `contact_medium.suppressed_at` (+ reason) and `party.do_not_contact`. Those
// are OUR stance, and a mis-click must be undoable. Everything else a medium
// can carry — an unsubscribe, a complaint, a hard bounce, a DNC registry
// listing, an invalid verification — is a fact from the outside world or a
// legal opt-out. Lifting our suppression NEVER clears one of those, and a
// value still carrying one is still blocked afterwards. Saying so plainly is
// the point: a rep who unsuppresses a number must learn that the registry
// listing is what keeps it dark.
//
// `contactPointBlockReason` above answers "may we use this point?" (one
// reason, record-first precedence). These answer "what is on this value, and
// what would survive an undo?" — the question the record page and the
// unsuppress confirm ask. Same facts, one file.

export const MEDIUM_BLOCKS = [
  "suppressed",
  "unsubscribed",
  "complaint",
  "bounced",
  "dnc_listed",
  "invalid",
] as const;
export type MediumBlock = (typeof MEDIUM_BLOCKS)[number];

export const MEDIUM_BLOCK_LABELS: Record<MediumBlock, string> = {
  suppressed: "Suppressed",
  unsubscribed: "Unsubscribed",
  complaint: "Complaint",
  bounced: "Bounced",
  dnc_listed: "DNC listed",
  invalid: "Invalid",
};

/** Why each block exists, in the words a rep needs when they hit it. */
export const MEDIUM_BLOCK_EXPLAINERS: Record<MediumBlock, string> = {
  suppressed: "Suppressed here by your team (do-not-call request or a scrub).",
  unsubscribed: "The person unsubscribed — a legal opt-out, not ours to lift.",
  complaint: "A spam complaint was filed against this value.",
  bounced: "Delivery hard-bounced or was blocked at the receiving end.",
  dnc_listed: "Listed on a do-not-call registry.",
  invalid: "Verification found this value invalid.",
};

/** The only block that is ours, and therefore the only one an undo may clear. */
export const REVERSIBLE_BLOCK: MediumBlock = "suppressed";

/**
 * Every reason this medium cannot be used. Mirrors the DB's generated
 * `is_contactable` expression — keep them in step: that column is the
 * authority every send path reads.
 */
export function mediumBlocks(medium: ContactMediumRow): MediumBlock[] {
  const blocks: MediumBlock[] = [];
  if (medium.suppressed_at) blocks.push("suppressed");
  if (medium.unsubscribed_at) blocks.push("unsubscribed");
  if (medium.complaint_at) blocks.push("complaint");
  if (medium.bounce_type === "hard" || medium.bounce_type === "block") {
    blocks.push("bounced");
  }
  if (medium.dnc_state === "listed") blocks.push("dnc_listed");
  if (medium.verification_status === "invalid") blocks.push("invalid");
  return blocks;
}

/** Did OUR team suppress this value (the reversible half)? */
export function isTenantSuppressed(medium: ContactMediumRow): boolean {
  return medium.suppressed_at != null;
}

/** What would still block this value after our suppression is lifted. */
export function blocksSurvivingUnsuppress(
  medium: ContactMediumRow,
): MediumBlock[] {
  return mediumBlocks(medium).filter((b) => b !== REVERSIBLE_BLOCK);
}

/** "Unsubscribed · DNC listed" — one line for a confirm dialog or a toast. */
export function describeBlocks(blocks: MediumBlock[]): string {
  return blocks.map((b) => MEDIUM_BLOCK_LABELS[b]).join(" · ");
}

/**
 * A suppression whose `suppression_expires_at` has passed still blocks, because
 * the generated `is_contactable` column ignores expiry — the DB has no clock.
 * Surfacing it is how a rep knows the undo is expected rather than an override.
 */
export function isSuppressionExpired(medium: ContactMediumRow): boolean {
  return (
    medium.suppressed_at != null &&
    medium.suppression_expires_at != null &&
    new Date(medium.suppression_expires_at).getTime() <= Date.now()
  );
}
