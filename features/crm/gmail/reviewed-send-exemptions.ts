// features/crm/gmail/reviewed-send-exemptions.ts
//
// 🚨 WHAT THE SEND AUTHORITY SAID AND THE SPINE SET ASIDE — TOLD TO THE PERSON
// WHO IS ABOUT TO APPROVE THE MESSAGE.
//
// `crm.check_send_eligibility` answers for a COLD CAMPAIGN when no list is
// named, so a reviewed 1:1 message to one named contact trips the jurisdiction
// branch, the AUP acceptance and the postal-footer requirement. Refusing on
// those would refuse essentially every reviewed send, so the spine ENUMERATES
// the exemptions (`GATE_EXEMPT_BLOCKS` in aidream
// `services/outreach_single_send/reviewed_send.py`) and refuses on everything
// else, including a code it has never heard of.
//
// The exemption is right. The SILENCE was the defect (VERIFY-B1-B2-R5 W3):
// `_blocks_that_refuse` `continue`s over an exempt code and keeps nothing, so
// "Germany requires permission BEFORE you write, even for business email"
// vanished — not before the click, not after, not on the row. The approver is the
// legal actor on a 1:1 message, and §5.4's audit standard is that what the
// authority said is recorded.
//
// This module is the BEFORE-THE-CLICK half, computed from the verdict the
// surface already holds. The AFTER half is `exempted_blocks` on the reviewed-send
// answer (lane B-26), read in `./reviewed-send-contract.ts`.
//
// 🚨 THE TABLE IS THE SERVER'S, BYTE FOR BYTE, AND IT IS MEASURED:
// `./reviewed-send-exemptions-are-the-servers.test.ts` reads
// `GATE_EXEMPT_BLOCKS` out of the sibling aidream checkout and FAILS on any code
// or sentence that differs — because a client disclosing a stale exemption set
// would tell a person a rule was set aside that in fact refused the message, or
// the reverse.
//
// Pure: no React, no Supabase, no network.

/**
 * Block codes a reviewed 1:1 message is NOT judged by, and WHY — the server's
 * own mapping, in the server's own words.
 */
export const REVIEWED_SEND_EXEMPT_BLOCKS: Readonly<Record<string, string>> = {
  list_not_found: "A reviewed 1:1 message belongs to no outreach list.",
  list_other_org: "A reviewed 1:1 message belongs to no outreach list.",
  recipient_not_in_list:
    "The recipient is a CRM contact, not a campaign member. Membership is what a " +
    "campaign send checks; this message was composed on a record.",
  purchased_list_suspected:
    "List-quality scoring judges a list; there is no list.",
  jurisdiction_unresolved:
    "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
  jurisdiction_unknown:
    "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
  jurisdiction_prohibited:
    "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
  role_relevance_unproven:
    "Role relevance is recorded for a campaign's selection, not a reply.",
  individual_subscriber:
    "PECR's subscriber distinction governs marketing, not 1:1 correspondence.",
  source_undisclosed:
    "Source disclosure rides the campaign footer; see the envelope note below.",
  lia_missing: "A legitimate-interest assessment is written per campaign.",
  no_consent_record:
    "Opt-in consent governs marketing sends; this is not one.",
  consent_expired: "Opt-in consent governs marketing sends; this is not one.",
  no_postal_address:
    "The postal block rides the commercial-message footer, which this send has none of.",
  aup_not_accepted:
    "Accepting the outreach rules gates campaigns; it does not gate answering a customer.",
  address_unverified:
    "Verification staleness is a campaign hygiene rule; the sender typed this address.",
  disposable_address:
    "Outreach may not target disposable addresses; a person answering one may.",
};

/**
 * The identity-READINESS codes a `purpose='correspondence'` mailbox is not judged
 * by (the spine's `CORRESPONDENCE_EXEMPT_BLOCKS`, VERIFY-B1-B2-R5 W2).
 *
 * 🚨 SCOPED TO THE MAILBOX'S PURPOSE, never to the send being 1:1: name an
 * OUTREACH mailbox and every one of these still refuses, because then they are
 * about the mailbox actually being used.
 */
export const CORRESPONDENCE_EXEMPT_BLOCKS: Readonly<Record<string, string>> = {
  identity_not_ready:
    "Campaign setup judges a campaign mailbox. This message went out through a " +
    "mailbox recorded for audit only, which never finishes outreach setup.",
  domain_unverified:
    "Domain ownership is proven for a campaign mailbox. Nobody can publish our TXT " +
    "record on a personal mailbox provider's domain, and this message did not need it.",
  authentication_failing:
    "SPF, DKIM and DMARC are the campaign mailbox's own domain records; a personal " +
    "mailbox sends under its provider's, which we do not administer.",
  authentication_never_checked:
    "The authentication check runs on campaign mailboxes only — a mailbox recorded " +
    "for audit is never swept, deliberately.",
  domain_too_new:
    "Domain age is a cold-campaign deliverability rule; it does not judge a person " +
    "answering a customer from their own mailbox.",
  role_sender_address:
    "Sending campaigns from a role address hurts a campaign's reputation. A person " +
    "answering from the shared mailbox they actually use is not that.",
  rfc8058_dkim_unavailable:
    "One-click unsubscribe needs DKIM on our own domain. A reviewed 1:1 from a " +
    "mailbox recorded for audit carries no unsubscribe header at all.",
};

/** The purpose word that widens the exemption set, in the server's spelling. */
export const PURPOSE_CORRESPONDENCE = "correspondence";

/**
 * The exemption table for THIS send, assembled the way `exemptions_for` does.
 *
 * 🚨 FAIL CLOSED on an unknown purpose: anything that is not the literal
 * `correspondence` gets the campaign-machinery table only, so an unreadable
 * mailbox never wins an identity-readiness exemption.
 */
export function exemptionsFor(
  identityPurpose?: string | null,
): Readonly<Record<string, string>> {
  if (identityPurpose !== PURPOSE_CORRESPONDENCE) {
    return REVIEWED_SEND_EXEMPT_BLOCKS;
  }
  return { ...REVIEWED_SEND_EXEMPT_BLOCKS, ...CORRESPONDENCE_EXEMPT_BLOCKS };
}

/** One rule the authority raised that this message class is not judged by. */
export interface ExemptedBlockNotice {
  code: string;
  /** The authority's own sentence about the rule. */
  message: string;
  /** Why it does not apply to a reviewed 1:1 — the spine's own reason. */
  whyExempt: string;
  /**
   * 🚨 THE ONES THAT ARE A LEGAL FACT ABOUT THE RECIPIENT, not campaign
   * bookkeeping. "Germany requires permission before you write, even for
   * business email" is something the person pressing Send has to know; "there is
   * no outreach list" is not. A surface that can only show a few shows these.
   */
  legallyMaterial: boolean;
}

/**
 * The codes a person is told about BEFORE the click, loudly. Each is a statement
 * about the recipient or their country, not about a campaign we do not have.
 */
export const LEGALLY_MATERIAL_EXEMPT_CODES: readonly string[] = [
  "jurisdiction_prohibited",
  "jurisdiction_unknown",
  "jurisdiction_unresolved",
  "individual_subscriber",
  "address_unverified",
  "disposable_address",
];

/** True when the spine exempts this code on a reviewed 1:1 send. */
export function isExemptOnReviewedSend(
  code: string,
  identityPurpose?: string | null,
): boolean {
  return Object.hasOwn(exemptionsFor(identityPurpose), code);
}

/**
 * EVERY BLOCK IN THE VERDICT THE SPINE WILL SET ASIDE, with the reason.
 *
 * Fed the verdict the surface already fetched from the one authority. A code the
 * spine does NOT exempt is left out of this list on purpose: that one refuses
 * the send, and it is shown as a refusal, not as a note.
 *
 * Ordered legally-material first, so a surface that shows two shows those.
 */
export function exemptedBlocksOfVerdict(
  verdict: {
    blocks: readonly { code: string; message: string }[];
  },
  identityPurpose?: string | null,
): ExemptedBlockNotice[] {
  const table = exemptionsFor(identityPurpose);
  const notices: ExemptedBlockNotice[] = [];
  for (const block of verdict.blocks) {
    const whyExempt = table[block.code];
    if (whyExempt === undefined) continue;
    notices.push({
      code: block.code,
      message: block.message,
      whyExempt,
      legallyMaterial: LEGALLY_MATERIAL_EXEMPT_CODES.includes(block.code),
    });
  }
  return notices.sort((left, right) =>
    left.legallyMaterial === right.legallyMaterial
      ? 0
      : left.legallyMaterial
        ? -1
        : 1,
  );
}

/** The heading a surface puts above those notices. Never "warnings". */
export const EXEMPTED_BLOCKS_HEADING =
  "Rules that would stop this as a campaign, and do not stop it as a reply";

// ── The compliance class, and the footer appended AFTER approval ─────────────

/** The two classes, in the server's own spelling (`COMPLIANCE_CLASS_*`). */
export const COMPLIANCE_CLASS_CORRESPONDENCE = "correspondence";
export const COMPLIANCE_CLASS_COMMERCIAL = "commercial_outreach";

export type ReviewedSendComplianceClass =
  | typeof COMPLIANCE_CLASS_CORRESPONDENCE
  | typeof COMPLIANCE_CLASS_COMMERCIAL;

/**
 * WHICH CLASS THIS MESSAGE IS, and therefore whether the body that leaves is the
 * body on screen (VERIFY-B1-B2-R5 W4, chair ruling R24).
 *
 * The spine's rule is `compliance_envelope_required(*, identity_id, medium_id,
 * identity_purpose)`: a footer only when the send names the recipient's medium AND
 * a sending mailbox whose `purpose` is NOT `correspondence`. Then
 * `send_reviewed_gmail` sets `List-Unsubscribe` / `List-Unsubscribe-Post` and
 * sends `body.rstrip() + envelope.text_footer`, which adds "This is a commercial
 * message." for any consent basis that is not express, plus the postal block — so
 * the bytes that leave are NOT the bytes on the card unless the reviewer is told.
 *
 * 🚨 FAIL LOUD, NOT QUIET: an unreadable/unknown purpose counts as outreach, the
 * same direction the server errs in, because a reviewer warned about a footer
 * that then is not appended has lost nothing, and the reverse is the defect.
 *
 * Mirrored here rather than guessed, and measured against the server's own
 * predicate by `./reviewed-send-exemptions-are-the-servers.test.ts`.
 */
export function complianceFooterWillBeAppended(target: {
  identityId?: string | null;
  mediumId?: string | null;
  identityPurpose?: string | null;
}): boolean {
  if (!(target.identityId?.trim() && target.mediumId?.trim())) return false;
  return target.identityPurpose !== PURPOSE_CORRESPONDENCE;
}

export function complianceClassOf(target: {
  identityId?: string | null;
  mediumId?: string | null;
  identityPurpose?: string | null;
}): ReviewedSendComplianceClass {
  return complianceFooterWillBeAppended(target)
    ? COMPLIANCE_CLASS_COMMERCIAL
    : COMPLIANCE_CLASS_CORRESPONDENCE;
}

/** What each class means for the body, said BEFORE the click. */
export const COMPLIANCE_CLASS_SENTENCE: Readonly<
  Record<ReviewedSendComplianceClass, string>
> = {
  [COMPLIANCE_CLASS_COMMERCIAL]:
    "This message goes out through a mailbox registered for outreach, so it " +
    "counts as a commercial message: after you approve it, an unsubscribe link " +
    "and your organization's postal address are added to the end of the body, " +
    "and one-click-unsubscribe headers are attached. What arrives is the body " +
    "below plus that footer.",
  [COMPLIANCE_CLASS_CORRESPONDENCE]:
    "This is an ordinary one-to-one message from your own mailbox: no " +
    "unsubscribe link and no postal footer are added, and the body that arrives " +
    "is exactly the body below.",
};

/** The short label a badge uses, for people who do not read legal words. */
export const COMPLIANCE_CLASS_LABEL: Readonly<
  Record<ReviewedSendComplianceClass, string>
> = {
  [COMPLIANCE_CLASS_COMMERCIAL]: "Commercial message — a footer is added",
  [COMPLIANCE_CLASS_CORRESPONDENCE]: "Sent exactly as approved",
};

/**
 * 🚨 R24 — THE BODY SENT IS THE BODY APPROVED, and the server refuses when it is
 * not.
 *
 * Lane B-26 hashes the approved body and refuses the send when the bytes it is
 * about to hand Gmail do not match it. That refusal arrives as an ordinary
 * `gmail_send_refused` block, so `reviewedSendRefusalOf` already renders its
 * sentence and fix — this constant exists so a surface can NAME it (and so the
 * census can measure whether the server declares it yet).
 */
export const BODY_HASH_MISMATCH_BLOCK_CODE = "body_hash_mismatch";
