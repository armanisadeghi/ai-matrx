// features/crm/compliance/types.ts
//
// The shapes the compliance gate speaks. These mirror the jsonb returned by
// crm.check_send_eligibility — the ONE send authority — so a caller never has to
// guess at the verdict's structure.
//
// System-of-record: /Users/armanisadeghi/code/common-docs/systems/outreach-compliance/

/** Which lane a campaign is in. Enforced in the DB; never a boolean on a send(). */
export type OutreachLane = "cold_outreach" | "opt_in_marketing";

/**
 * The lawful basis for contacting a value. These are the names the LAW uses —
 * CASL's express/implied/EBR/inquiry/conspicuous-publication, GDPR's legitimate
 * interest, PECR's soft opt-in — not invented categories.
 */
export type ConsentBasis =
  | "express"
  | "implied_ebr"
  | "implied_inquiry"
  | "conspicuous_publication"
  | "legitimate_interest"
  | "soft_opt_in"
  | "none";

/** PECR turns on this. Sole traders and ordinary partnerships are `individual`. */
export type SubscriberKind = "individual" | "corporate" | "unknown";

/** Whether cold outreach (no prior express consent) is permitted in a country. */
export type ColdVerdict = "allowed" | "conditional" | "prohibited" | "unknown";

/**
 * Every block carries a fix, not just a reason. Our user is a brilliant
 * non-technical expert: a refusal with no next step is a dead end that ends
 * their outreach on day one (outreach handoff §5.3b).
 */
export type EligibilityBlock = {
  code: EligibilityBlockCode;
  message: string;
  fix: string;
};

export type EligibilityWarning = {
  code: string;
  message: string;
};

/**
 * Exhaustive so a surface can special-case a block (e.g. deep-link the DNS
 * checklist for `authentication_failing`) without string-matching prose.
 * Adding a code here means adding it in crm.check_send_eligibility too — the
 * function is the authority, this is the mirror.
 */
export type EligibilityBlockCode =
  // org / account
  | "org_outreach_disabled"
  | "aup_not_accepted"
  | "no_postal_address"
  // recipient suppression — a legal opt-out outranks everything
  | "unsubscribed"
  | "complained"
  | "suppressed"
  | "dnc_listed"
  | "hard_bounced"
  // recipient deliverability
  | "address_invalid"
  | "address_unverified"
  | "mx_missing"
  | "disposable_address"
  | "medium_not_found"
  // list integrity — applies before the lane branch, so BOTH lanes
  | "list_not_found"
  | "list_other_org"
  | "recipient_not_in_list"
  | "purchased_list_suspected"
  // lane A
  | "no_consent_record"
  | "consent_expired"
  // lane B — jurisdiction
  | "jurisdiction_unresolved"
  | "jurisdiction_unknown"
  | "jurisdiction_prohibited"
  | "role_relevance_unproven"
  | "individual_subscriber"
  | "source_undisclosed"
  | "lia_missing"
  // the sending mailbox
  | "identity_not_found"
  | "identity_other_org"
  | "identity_not_ready"
  | "domain_unverified"
  | "authentication_failing"
  | "rfc8058_dkim_unavailable"
  | "role_sender_address"
  | "domain_too_new";

export type EligibilityVerdict = {
  allowed: boolean;
  lane: OutreachLane;
  blocks: EligibilityBlock[];
  warnings: EligibilityWarning[];
  resolved: {
    jurisdiction: string | null;
    confidence: "high" | "medium" | "none";
    method: string;
    jurisdiction_verdict: ColdVerdict | null;
    /**
     * FALSE for every row today. `agent-research` is not ratification — an
     * attorney has not signed any jurisdiction row yet. Surfaces should say so
     * rather than implying legal clearance.
     */
    jurisdiction_ratified: boolean;
    consent_basis: ConsentBasis;
    subscriber_kind: SubscriberKind;
    list_quality?: {
      status: "passed" | "blocked";
      signals: string[];
      member_count?: number;
      email_count?: number;
      missing_provenance_count?: number;
      role_address_count?: number;
      dominant_pattern_count?: number;
    } | null;
  };
};

/**
 * The blocks a customer can fix themselves right now, versus the ones that are
 * simply final. Used to decide whether a surface offers a repair path or an
 * explanation. `unsubscribed` is never repairable — only the recipient can
 * reverse it, and offering a fix would be offering to break the law.
 */
export const UNFIXABLE_BLOCKS: ReadonlySet<EligibilityBlockCode> = new Set([
  "unsubscribed",
  "complained",
  "dnc_listed",
  "jurisdiction_prohibited",
  "individual_subscriber",
]);

/** The AUP version a customer accepts. Bump when the policy text changes. */
export const OUTREACH_POLICY_VERSION = "2026-08-15.draft-1";
