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

/** Bucketed view of the caller's links, ready for the dashboard sections. */
export interface GuardianLinkBuckets {
  /** Students who granted me access — the viewable roster (role=guardian, active). */
  students: GuardianLinkView[];
  /** Requests I sent that are awaiting the student's approval (role=guardian, pending). */
  sent: GuardianLinkView[];
  /** Guardian requests awaiting MY approval (role=student, pending) — the consent inbox. */
  inbox: GuardianLinkView[];
}
