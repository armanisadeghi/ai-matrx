// lib/sms/routingFailure.ts
//
// AN INBOUND TEXT THAT NO ORGANIZATION HAS REGISTERED IS A ROUTING FAILURE.
// IT IS NOT AN INVITATION TO PICK AN ORGANIZATION FOR IT.
//
// Ruling (Arman, 2026-09-19): a "default organization" is at most a per-client
// DISPLAY preference. Nothing but the org picker and pure UI display may read
// it. No data read, write, API route, boot ladder, trigger or billing query may
// pick or substitute an organization — not a cookie, not a preference, not the
// personal organization, not the platform's own system organization.
//
//   "one missed org check that should have just failed turns into 50 in a
//    month and 5,000 in a year, and suddenly we don't have orgs any more, we
//    have a user and a default org, which means we just have user now."
//
// The Twilio inbound lane was the last place in this repo that still
// substituted. `findOrCreateConversation` resolved the thread's organization
// through `resolveOrgIdForUserServer(supabase, userId)` — the routed person's
// PERSONAL workspace — and before 2026-09-19 fell through to the platform's own
// system organization when nothing routed at all. The reasoning on the way in
// was "a webhook has no session and nobody to ask", and that reasoning was
// wrong, because it assumed the answer had to be resolved from a PERSON.
//
// It does not. A phone number is REGISTERED, and the registration carries the
// organization: `communication.sms_phone_numbers.organization_id` and
// `communication.sms_notification_preferences.organization_id` are both NOT
// NULL (verified live, 2026-09-19). The routing answer was already in the
// database the whole time. Nothing needs to be chosen, so nothing may be.
//
// What is left is the genuinely unroutable case: a text arrives on a number no
// organization has registered, or from a sender with no enrolment. That is a
// defect in our own provisioning — a number bought and never assigned, a
// registration deleted out from under a live number — and it deserves to be
// LOUD. Nothing fails silently: this announces itself with the remedy, and the
// message is not stored anywhere rather than stored in the wrong place. A
// misfiled customer conversation is worse than a missing one, because nobody
// goes looking for a conversation they can see.

/** The phrase every SMS routing failure carries, so one grep finds them all. */
export const SMS_ROUTING_FAILURE_CODE = "sms_inbound_unrouted" as const;

/**
 * An inbound SMS reached us on a number no organization has registered.
 *
 * Thrown, never swallowed into a substitution. It logs at construction so the
 * failure reaches the server log even if a caller above decides to answer
 * Twilio with an empty TwiML rather than a 500 — Twilio retries, and a retry
 * that lands in the same silence teaches us nothing.
 */
export class SmsInboundRoutingFailure extends Error {
  override name = "SmsInboundRoutingFailure" as const;
  readonly code = SMS_ROUTING_FAILURE_CODE;
  readonly fromNumber: string;
  readonly toNumber: string;

  constructor(fromNumber: string, toNumber: string) {
    super(
      `Inbound SMS from ${fromNumber} to ${toNumber} belongs to no organization: ` +
        `${toNumber} has no active row in communication.sms_phone_numbers and ` +
        `${fromNumber} has no row in communication.sms_notification_preferences. ` +
        `Nothing is substituted — a message filed in an organization nobody chose ` +
        `is worse than a message that was not filed. Remedy: register ${toNumber} ` +
        `to the organization that owns it (Administration → SMS → Numbers), or ` +
        `release the number at the provider so it stops accepting texts.`,
    );
    this.fromNumber = fromNumber;
    this.toNumber = toNumber;
    console.error(`[${SMS_ROUTING_FAILURE_CODE}] ${this.message}`);
  }
}

export function isSmsInboundRoutingFailure(
  error: unknown,
): error is SmsInboundRoutingFailure {
  return (
    error instanceof SmsInboundRoutingFailure ||
    (error instanceof Error && error.name === "SmsInboundRoutingFailure")
  );
}

/** One registration row, as both inbound lookups return it. */
export interface SmsOrganizationRegistration {
  user_id: string | null;
  organization_id: string;
}

/**
 * THE INBOUND ORGANIZATION DECISION, in one place both the webhook and its
 * test bind to.
 *
 * It lives here rather than inline in `findOrCreateConversation` for one
 * reason: a test that re-implements the rule it is testing proves only that
 * the test author can write the rule twice. Every reintroduction of a
 * person-derived or platform-derived organization has to come through this
 * function, so the test that pins its behaviour is a real guard.
 *
 * Order, and why:
 *   1. OUR number's registration (`communication.sms_phone_numbers`). The
 *      organization that owns the number a message was sent TO is, by
 *      definition, the organization the message is for. It outranks the
 *      sender's enrolment even when the two disagree.
 *   2. The sender's enrolment (`communication.sms_notification_preferences`),
 *      itself an org-scoped row.
 *
 * Neither resolving is a ROUTING FAILURE, not an invitation to pick one.
 */
export function resolveInboundSmsOrganization(args: {
  fromNumber: string;
  toNumber: string;
  phoneOwner: SmsOrganizationRegistration | null;
  senderUser: SmsOrganizationRegistration | null;
}): string {
  const organizationId =
    args.phoneOwner?.organization_id ?? args.senderUser?.organization_id ?? null;
  if (!organizationId) {
    throw new SmsInboundRoutingFailure(args.fromNumber, args.toNumber);
  }
  return organizationId;
}
