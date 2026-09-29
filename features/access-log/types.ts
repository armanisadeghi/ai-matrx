// features/access-log/types.ts
//
// THE ACCESS LOG — "every time anyone opened my data".
//
// Rows come from HR's own break-glass door (public.hr_break_glass) and from
// account take-over (public.org_admin_take_over_account). The organization-admin
// emergency door is retired (access ladder T-16, 2026-09-28): Private is the
// owner alone, and an organization admin's only way in is taking over the
// account — a written reason, the person told, recorded here.
//
// 🚨 EVERY ROW CARRIES ITS OWN WORDS. Surfaces render the recorded reason
// verbatim and never invent replacement copy for it.

/**
 * One row of the access log — `iam.my_access_log` (the subject's own) and
 * `iam.org_access_log` (an organization's).
 *
 * 🚨 A REFUSED ATTEMPT IS A ROW. The audit records the door being tried and
 * turned away exactly as it records it opening, and the refusals are the point
 * of the page — never filter them out, never fold them into a count.
 */
export interface AccessLogEntry {
  id: string;
  occurredAt: string | null;
  /** What was attempted (`emergency_door_open`, `read`, …). */
  action: string | null;
  targetToken: string | null;
  /** Zero or more record ids the one action covered. */
  targetIds: string[];
  dataClass: string | null;
  purpose: string | null;
  justification: string | null;
  granted: boolean;
  /** Set when `granted` is false. */
  denialReason: string | null;
  /** Who did it. May be unresolvable to a name — show the id, never hide it. */
  /**
   * Who AUTHORISED it. On the two-person `private` path this is the APPROVER,
   * not the reader — naming this person as the one who opened the record is
   * the defect V-38 found on the subject's own page (2026-09-12).
   */
  actorUserId: string | null;
  /**
   * Who did it, NAMED — resolved inside the definer door, because a person
   * reading their own access page cannot resolve a uuid and a screen that
   * shows one is a screen that tells them nothing.
   */
  actorLabel: string | null;
  /**
   * WHO HOLDS THE KEY — the answer to "who opened my data". On a `confidential`
   * open this is the same person as the actor; on the two-person path it is the
   * REQUESTER. `null` only where the request that would have named them is gone
   * and the truth is genuinely unrecoverable — which the screen says, rather
   * than naming somebody.
   */
  granteeUserId: string | null;
  granteeLabel: string | null;
  grantExpiresAt: string | null;
  organizationId: string | null;
  /** Why the access was allowed at all (`emergency_door`, `owner`, …). */
  basis: string | null;
  isEmergencyDoor: boolean;
  /** Only `iam.org_access_log` carries this — whose data was opened. */
  subjectUserId: string | null;
  /** Only `iam.org_access_log` carries this — the subject, named. */
  subjectLabel: string | null;
  /** Only `iam.my_access_log` carries this — the organization, named. */
  organizationLabel: string | null;
}

/**
 * Every door call returns this. NOTHING in `service.ts` throws when the server
 * says no, and nothing swallows a failure either: a transport or database
 * failure becomes `{ ok: false }` with a sentence a person can read, so the
 * surface can say what went wrong instead of rendering a blank.
 */
export type EmergencyAccessResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** A human sentence. Never a bare Postgres code. */
      message: string;
      /** The Postgres error code, when there was one. */
      code: string | null;
      /** The driver's own words, for a console/report — never the only copy. */
      technical: string | null;
    };

export function isEmergencyAccessOk<T>(
  result: EmergencyAccessResult<T>,
): result is { ok: true; data: T } {
  return result.ok;
}
