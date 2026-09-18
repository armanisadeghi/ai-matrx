/**
 * anonymousByDesignDoors.ts — the doors this app calls from the browser WITHOUT
 * a session, on purpose, by name (DD-237 · declared under DD-212).
 *
 * WHAT THIS LIST IS
 * -----------------
 * The session barrier (`utils/supabase/sessionBarrier.ts`) makes a request that
 * needs a session wait for one. A door on this list never waits and is never
 * retried on a session refusal, because "no session" is its normal, designed
 * caller: the meeting guest, the e-sign signer, the kiosk tablet, the
 * unsubscribe link, the signed-out client recording that something broke.
 *
 * WHAT THIS LIST IS NOT
 * ---------------------
 * 🚨 It is NOT an authorization decision and it can never widen access. Every
 * name here is a mirror of the database's own declaration — the source of
 * record is `platform.client_callable_door` where `anonymous_callers = true`,
 * with the reason in `anonymous_purpose`. The grant lives there, the RLS lives
 * there, and a name present or missing here changes only whether the client
 * spends up to SESSION_ATTACH_BUDGET_MS waiting before it asks. A name that is
 * missing costs a harmless wait; a name added here that the DB has NOT declared
 * buys the caller exactly nothing.
 *
 * REFRESHING IT
 * -------------
 * Captured 2026-09-14 from the live database (47 doors) with:
 *
 *   select schema_name, function_name, anonymous_purpose
 *     from platform.client_callable_door
 *    where anonymous_callers is true
 *    order by 1, 2;
 *
 * Re-run that query and reconcile when a new anonymous door is declared. There
 * is no drift alarm on purpose: drift here cannot make the app wrong, only
 * marginally slower on a door nobody waits for today.
 */

/** `schema.function` exactly as PostgREST names it. */
export interface AnonymousDoor {
  readonly schema: string;
  readonly name: string;
  /** Why a caller with no account reaches this door — never blank. */
  readonly purpose: string;
}

export const ANONYMOUS_BY_DESIGN_DOORS: readonly AnonymousDoor[] = [
  {
    schema: "billing",
    name: "public_plans",
    purpose: "A visitor with no account reads the pricing page.",
  },
  {
    schema: "communication",
    name: "meet_meeting_by_slug",
    purpose: "A meeting guest with no account joins from a link.",
  },
  {
    schema: "communication",
    name: "meet_record_consent",
    purpose: "A meeting guest with no account records their consent.",
  },
  {
    schema: "iam",
    name: "has_access",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "iam",
    name: "has_org_access",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "iam",
    name: "my_orgs",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "public",
    name: "assoc_for_entity",
    purpose: "A signed-out visitor on a public-class entity page.",
  },
  {
    schema: "public",
    name: "assoc_for_sources",
    purpose: "A signed-out visitor on a public-class entity page.",
  },
  {
    schema: "public",
    name: "assoc_for_targets",
    purpose: "A signed-out visitor on a public-class entity page.",
  },
  {
    schema: "public",
    name: "check_guest_execution_limit",
    purpose: "A guest runs a public agent app; a fingerprint stands in for an identity.",
  },
  {
    schema: "public",
    name: "creator_public_handles",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "creator_public_page",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "edu_public_decks",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "esign_signer_adopt_signature",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_consent",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_decline",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_delegate",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_download_url",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_load",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_preview_ack",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "esign_signer_sign",
    purpose: "A signer with no account opens an e-sign envelope from an emailed link.",
  },
  {
    schema: "public",
    name: "get_aga_public_data",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "get_agent_public",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "get_public_flashcard_set",
    purpose: "A signed-out visitor on an app/(public) route.",
  },
  {
    schema: "public",
    name: "has_permission",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "public",
    name: "hr_kiosk_authenticate",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_claim_pairing",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_pin_reset",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_punch",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_session_close",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_session_heartbeat",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "hr_kiosk_session_open",
    purpose: "The HR time-clock tablet under app/(kiosk) runs with no user session by design.",
  },
  {
    schema: "public",
    name: "inv_peek_invited_email",
    purpose: "An invitee without an account prefills sign-up from the invitation token.",
  },
  {
    schema: "public",
    name: "is_admin",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "public",
    name: "is_platform_admin",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "public",
    name: "is_super_admin",
    purpose: "A caller-identity predicate evaluated as the querying role inside RLS.",
  },
  {
    schema: "public",
    name: "log_client_error",
    purpose:
      "A signed-out client recording that something broke — the error sink must " +
      "never wait on the session whose absence it is reporting.",
  },
  {
    schema: "public",
    name: "outreach_unsubscribe",
    purpose: "A signed-out recipient taps unsubscribe in an email.",
  },
  {
    schema: "public",
    name: "outreach_unsubscribe_preview",
    purpose: "A signed-out recipient taps unsubscribe in an email.",
  },
  {
    schema: "public",
    name: "outsider_begin",
    purpose: "An outsider invited into one piece of work through an actor-token link.",
  },
  {
    schema: "public",
    name: "outsider_send_code",
    purpose: "An outsider invited into one piece of work through an actor-token link.",
  },
  {
    schema: "public",
    name: "outsider_session_ping",
    purpose: "An outsider invited into one piece of work through an actor-token link.",
  },
  {
    schema: "public",
    name: "outsider_verify",
    purpose: "An outsider invited into one piece of work through an actor-token link.",
  },
  {
    schema: "public",
    name: "record_guest_execution",
    purpose: "A guest runs a public agent app; a fingerprint stands in for an identity.",
  },
  {
    schema: "public",
    name: "resolve_share_token",
    purpose: "The signed-out holder of a share link follows it from SMS or email.",
  },
  {
    schema: "public",
    name: "resolve_short_link",
    purpose: "The signed-out holder of a short link follows it from SMS or email.",
  },
  {
    schema: "public",
    name: "share_token_keyword_metrics",
    purpose: "The signed-out holder of a share link follows it from SMS or email.",
  },
] as const;

const QUALIFIED: ReadonlySet<string> = new Set(
  ANONYMOUS_BY_DESIGN_DOORS.map((door) => `${door.schema}.${door.name}`),
);
/**
 * Bare names too. A call site reaches a door through PostgREST's exposed schema
 * — `supabase.rpc("meet_meeting_by_slug")` carries no schema at all, while the
 * declaration names `communication` — so the qualified key alone would miss it.
 * Matching the bare name is safe because a hit removes a WAIT and nothing else:
 * the grant, the RLS and the refusal are all still the database's.
 */
const BARE: ReadonlySet<string> = new Set(
  ANONYMOUS_BY_DESIGN_DOORS.map((door) => door.name),
);

/**
 * Is this door declared anonymous-by-design? A call with no relation name is
 * never treated as anonymous — the barrier's default is to protect.
 *
 * 🚨 THIS SUPPRESSES THE RETRY, NEVER THE WAIT, and the difference is the whole
 * point. Most of these doors serve BOTH audiences: `assoc_for_targets` answers
 * a signed-out visitor from the public-class lane and a signed-in reader from
 * theirs, and it fires on nearly every page. If the barrier let such a call
 * skip the wait, a signed-in reader whose session had not attached yet would be
 * handed the ANONYMOUS answer — fewer rows, no error, nothing on screen to say
 * so. That is the silent-wrongness this whole lane exists to end. So a caller
 * whose browser holds an auth cookie still waits for its session here; a caller
 * with no cookie never waited in the first place. What this list removes is the
 * retry: a 42501 on one of these doors is the function's honest refusal to a
 * guest (`meet_meeting_by_slug` answers "this meeting is not open to guests —
 * sign in with an account in the organization"), not a session bug to replay.
 */
export function isAnonymousByDesign(
  schema: string | undefined,
  relation: string | undefined,
): boolean {
  if (!relation) return false;
  if (QUALIFIED.has(`${schema ?? "public"}.${relation}`)) return true;
  return BARE.has(relation);
}

/**
 * The doors that must never wait for a session, even when one is expected.
 *
 * Exactly one, and it is the error sink: `persistCapturedErrors` calls
 * `log_client_error` to report failures, and a sink that waited on the session
 * whose absence it is reporting would be the slowest possible way to lose the
 * evidence. Everything else waits — see the note above.
 */
const NEVER_WAITS: ReadonlySet<string> = new Set(["log_client_error"]);

/** Does this door skip the pre-send session wait entirely? */
export function bypassesSessionWait(relation: string | undefined): boolean {
  if (!relation) return false;
  return NEVER_WAITS.has(relation);
}
