/**
 * THE PHONE NUMBER'S REGISTRATION NAMES THE ORGANIZATION — NOT A PERSON'S
 * PERSONAL WORKSPACE, AND NOT THE PLATFORM.
 *
 * Ruling (Arman, 2026-09-19): nothing but the org picker and pure UI display
 * may read a default organization, and no write may substitute one — not a
 * cookie, not a preference, not the personal organization, not the system
 * organization.
 *
 *   "one missed org check that should have just failed turns into 50 in a
 *    month and 5,000 in a year, and suddenly we don't have orgs any more, we
 *    have a user and a default org, which means we just have user now."
 *
 * WHAT THIS TEST IS FOR
 * ---------------------
 * The Twilio inbound lane was the last substitution left in this repo, and it
 * was ALLOWLISTED past the guard on the reasoning that "a webhook has no
 * session and nobody to ask, and every `communication.*` table declares
 * `organization_id NOT NULL`, so the org-less shape cannot be expressed".
 *
 * That reasoning was wrong, and an allowlist entry is exactly the wrong place
 * for a wrong reason to sit: it reads as a decision rather than a defect. The
 * organization never had to be resolved from a PERSON. A phone number is
 * REGISTERED, and the registration carries the organization —
 * `communication.sms_phone_numbers.organization_id` and
 * `communication.sms_notification_preferences.organization_id` are both NOT
 * NULL (verified live 2026-09-19).
 *
 * So this test pins the three things that must stay true:
 *
 *   1. The org comes from the number the text was sent TO.
 *   2. Failing that, from the sender's own enrolment row.
 *   3. Failing BOTH, the message is a routing failure that is thrown and
 *      logged — never filed anywhere. A misfiled customer conversation is
 *      worse than a missing one, because nobody goes looking for a
 *      conversation they can already see.
 *
 * It is a FORCING test: it fails if anyone reintroduces a person-derived or
 * platform-derived organization here, because in that world case 3 quietly
 * succeeds instead of throwing.
 */
import {
  SmsInboundRoutingFailure,
  isSmsInboundRoutingFailure,
  resolveInboundSmsOrganization,
} from "../routingFailure";

// The REAL decision, imported from the module the webhook calls — not a copy.
// A test that re-implements its subject proves only that the rule can be
// written twice.
const resolveInboundOrganization = resolveInboundSmsOrganization;

const OUR_NUMBER = "+15550001111";
const THEIR_NUMBER = "+15559998888";
const TEAM_ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";
const A_PERSON = "99999999-9999-9999-9999-999999999999";

describe("an inbound SMS takes its organization from the number's registration", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the organization that registered OUR number, not the routed person's", () => {
    const org = resolveInboundOrganization({
      fromNumber: THEIR_NUMBER,
      toNumber: OUR_NUMBER,
      phoneOwner: { user_id: A_PERSON, organization_id: TEAM_ORG },
      senderUser: null,
    });
    expect(org).toBe(TEAM_ORG);
  });

  it("prefers OUR number's registration over the sender's enrolment when they disagree", () => {
    // The message was sent TO the team's number. That the sender also happens
    // to be enrolled somewhere else does not move the conversation.
    const org = resolveInboundOrganization({
      fromNumber: THEIR_NUMBER,
      toNumber: OUR_NUMBER,
      phoneOwner: { user_id: null, organization_id: TEAM_ORG },
      senderUser: { user_id: A_PERSON, organization_id: OTHER_ORG },
    });
    expect(org).toBe(TEAM_ORG);
  });

  it("falls back to the sender's own enrolment when our number is unregistered", () => {
    const org = resolveInboundOrganization({
      fromNumber: THEIR_NUMBER,
      toNumber: OUR_NUMBER,
      phoneOwner: null,
      senderUser: { user_id: A_PERSON, organization_id: OTHER_ORG },
    });
    expect(org).toBe(OTHER_ORG);
  });

  it("REFUSES when nothing registers the number — it does not invent a home", () => {
    // 🚨 THE WHOLE POINT. Before 2026-09-19 this case returned the routed
    // person's personal workspace, and before that the platform's own system
    // organization. Both filed a real customer conversation in a tenant nobody
    // chose. If this test ever stops throwing, a substitution has come back.
    expect(() =>
      resolveInboundOrganization({
        fromNumber: THEIR_NUMBER,
        toNumber: OUR_NUMBER,
        phoneOwner: null,
        senderUser: null,
      }),
    ).toThrow(SmsInboundRoutingFailure);
  });

  it("says what failed and what to do about it — nothing fails silently", () => {
    let caught: unknown;
    try {
      resolveInboundOrganization({
        fromNumber: THEIR_NUMBER,
        toNumber: OUR_NUMBER,
        phoneOwner: null,
        senderUser: null,
      });
    } catch (err) {
      caught = err;
    }
    expect(isSmsInboundRoutingFailure(caught)).toBe(true);
    const message = (caught as Error).message;
    expect(message).toContain(OUR_NUMBER);
    expect(message).toContain(THEIR_NUMBER);
    expect(message).toMatch(/Remedy:/);
    // It reaches the server log even if a caller above answers Twilio quietly.
    expect(console.error).toHaveBeenCalled();
  });

  it("a routing failure survives serialization, so a wrapper cannot lose it", () => {
    const err = new SmsInboundRoutingFailure(THEIR_NUMBER, OUR_NUMBER);
    const rehydrated = Object.assign(new Error(err.message), {
      name: "SmsInboundRoutingFailure",
    });
    expect(isSmsInboundRoutingFailure(rehydrated)).toBe(true);
  });
});
