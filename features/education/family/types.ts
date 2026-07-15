// features/education/family/types.ts
//
// Types for the Parent / Guardian dashboard. The guardian↔student link and every
// guardian read are backed by SECURITY DEFINER RPCs (migrations/edu_guardian_link.sql);
// row shapes are derived from the generated types — never hand-mirrored.

import type { Database } from "@/types/database.types";

/** One guardian_link row (education schema). */
export type GuardianLinkRow =
  Database["education"]["Tables"]["guardian_link"]["Row"];

/**
 * One row from `guardian_list_links()` — a link the caller participates in, with
 * a computed `role` (the caller's side) + the counterpart's identity. The client
 * buckets these into "my students", "requests I sent", and "my consent inbox".
 */
export type GuardianLinkView =
  Database["public"]["Functions"]["guardian_list_links"]["Returns"][number];

/** The caller's role on a link. */
export type GuardianRole = "guardian" | "student";

/** Link lifecycle status. Only `active` confers read access. */
export type GuardianLinkStatus = "pending" | "active" | "revoked";

/**
 * Result of a consent-initiation RPC (`guardian_grant` / `guardian_request_student`).
 *
 * D52: these RPCs return an IDENTICAL neutral shape whether or not the target
 * email resolves to an account — never confirming existence (no email-enumeration
 * oracle). `sent` = a request was recorded IF an account exists; `granted` = a
 * grant was recorded IF an account exists. The client shows the same neutral
 * message in both cases.
 */
export type GuardianConsentStatus = "sent" | "granted";
export interface GuardianConsentResult {
  status: GuardianConsentStatus;
}

/**
 * True when this link (seen from the guardian side) is an under-13 child whose
 * consent has NOT yet been verifiably confirmed (COPPA §312.5) — the guardian
 * must complete a verification method before the child is unblocked. Verified
 * links (verified_at set) and non-under-13 links do not need this step.
 */
export function needsConsentVerification(link: GuardianLinkView): boolean {
  return (
    link.role === "guardian" &&
    link.status === "active" &&
    link.student_age_band === "under_13" &&
    !link.verified_at
  );
}

/** Human label for a verifiable-consent method. */
export function consentMethodLabel(method: string | null): string {
  switch (method) {
    case "card":
      return "card verification";
    case "signed_form":
      return "signed consent form";
    case "vendor_id":
      return "identity verification";
    default:
      return "verification";
  }
}

/** Bucketed view of the caller's links, ready for the dashboard sections. */
export interface GuardianLinkBuckets {
  /** Students who granted me access — the viewable roster (role=guardian, active). */
  students: GuardianLinkView[];
  /** Requests I sent that are awaiting the student's approval (role=guardian, pending). */
  sent: GuardianLinkView[];
  /** Guardian requests awaiting MY approval (role=student, pending) — the consent inbox. */
  inbox: GuardianLinkView[];
}
