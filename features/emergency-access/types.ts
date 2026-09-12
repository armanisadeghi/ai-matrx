// features/emergency-access/types.ts
//
// THE EMERGENCY DOOR — the platform-wide break-glass (DD-137a).
//
// The door is a DELIBERATE act, never a toggle that quietly widens a page:
// a `confidential` record opens on ONE organization admin's word; a `private`
// record needs that admin's request PLUS the organization owner's approval —
// two named people, never one. Either way the grant is read-only, time-boxed,
// and the person whose data was opened is told at the moment it happens and
// keeps the record forever on their own page.
//
// 🚨 EVERY REFUSAL ALREADY CARRIES ITS OWN HUMAN SENTENCE. The `iam` doors
// return a `message` on grant AND on refusal, written once in the database so
// every surface says the same true thing. Surfaces RENDER that sentence
// verbatim. Never write replacement copy for a reason code here, and never map
// a reason to a prettier phrase — the day the door's rule changes, the
// database's sentence changes with it and the invented one starts lying.

/** One row of the controlled reason list (`iam.emergency_door_purposes()`). */
export interface EmergencyDoorPurpose {
  /** The registered slug written into the audit. Never free text. */
  slug: string;
  /** What a person sees in the picker. */
  name: string;
}

/**
 * The refusal codes `iam.emergency_door_open` is known to answer with.
 *
 * Widened with `(string & {})` on purpose: the database owns this list and may
 * grow it, and a code this client has never heard of must still render its
 * message rather than fall through a `switch` into silence.
 */
export type EmergencyDoorReason =
  | "awaiting_approval"
  | "unclassified_token"
  | "no_door_needed"
  | "not_an_org_admin"
  | "justification_too_short"
  | "unregistered_purpose"
  | "self"
  | "token_not_grantable"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** What `iam.emergency_door_open` answers. `message` is always renderable. */
export type EmergencyDoorOutcome =
  | {
      granted: true;
      /** The `iam.permissions` row the door minted, when the door reports one. */
      permissionId: string | null;
      /** When the read-only key stops working. */
      expiresAt: string | null;
      /** The door's own sentence. Render verbatim. */
      message: string;
    }
  | {
      granted: false;
      /** `awaiting_approval` means it WORKED and is now with an owner. */
      reason: EmergencyDoorReason;
      /** Present on `awaiting_approval`. */
      requestId: string | null;
      /** Present on a refusal the door audited. */
      auditId: string | null;
      /** The door's own sentence. Render verbatim. */
      message: string;
    };

/** One pending `private`-class request awaiting an organization owner. */
export interface EmergencyDoorRequest {
  id: string;
  /** Entity token of the record asked for (`platform.entity_types.token`). */
  targetToken: string;
  targetId: string | null;
  /** The person whose data it is. */
  subjectUserId: string | null;
  dataClass: string | null;
  /** Registered purpose slug. */
  purpose: string | null;
  /** The sentence the requester typed. Shown to the owner AND to the subject. */
  justification: string | null;
  /** The organization admin who asked. */
  requestedBy: string | null;
  /** The requester, named. `null` only when the lookup itself found nobody. */
  requestedByLabel: string | null;
  /** The subject, named. */
  subjectLabel: string | null;
  /** The organization the record belongs to, named. */
  organizationLabel: string | null;
  /** When the request itself lapses if nobody answers. */
  requestExpiresAt: string | null;
  createdAt: string | null;
  organizationId: string | null;
}

/** What `iam.emergency_door_approve` / `_deny` answer. */
export interface EmergencyDoorDecision {
  granted: boolean;
  /** The door's own sentence. Render verbatim. */
  message: string;
  expiresAt: string | null;
  reason: string | null;
}

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
  actorUserId: string | null;
  /**
   * Who did it, NAMED — resolved inside the definer door, because a person
   * reading their own access page cannot resolve a uuid and a screen that
   * shows one is a screen that tells them nothing.
   */
  actorLabel: string | null;
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
