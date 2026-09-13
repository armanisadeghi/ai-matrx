/**
 * THE SUBJECT'S OWN PAGE MUST NOT LIE ABOUT WHO READ HER DATA.
 *
 * The regression that produced this file (found by the independent browser
 * verifier V-38 on the real screen, 2026-09-12): `/me/access-log` rendered two
 * cards about one emergency access and BOTH were false.
 *
 *  (a) It named `admin@admin.com` as the person who opened the conversation.
 *      He APPROVED it; `test@test.com` held the key. The feed read
 *      `entry.actorLabel`, and on the two-person `private` path the actor of an
 *      `approved` audit row is the approver by construction.
 *
 *  (b) It painted the pending ask — an `action='requested'` row that was then
 *      APPROVED — as a red REFUSED card, with the invented reason "No reason
 *      recorded". The feed read `const refused = !entry.granted` and never
 *      looked at `entry.action`. `requested` and `expired` both carry
 *      `granted=false` and neither is a refusal, so EVERY private-class ask —
 *      the common case — landed on the subject's page as an accusation.
 *
 * Both defects lived in the MODEL, not the markup, which is why this suite
 * tests the model. Every fixture below is a verbatim row shape returned by
 * `iam.my_access_log` on the live database (`brsgrqvjdzwihsvnfqkf`), captured
 * 2026-09-12 from a real two-person approval: requester
 * `arman@titaniumsuccess.com`, approver `arman@armansadeghi.com`, subject
 * `seo@titaniumsuccess.com`.
 *
 * PROVEN FAILING FIRST: against the pre-fix logic (`!entry.granted`, actor as
 * the reader) the first three cases below fail — "asked" reads as "refused",
 * and the key holder comes back as the approver.
 */

import {
  accessLogBadge,
  accessLogOutcome,
  accessLogVerb,
  authorisedByLabel,
  keyHolderLabel,
} from "./presentation";
import type { AccessLogEntry } from "./types";

/** The columns `iam.my_access_log` does not vary across these cases. */
function row(overrides: Partial<AccessLogEntry>): AccessLogEntry {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    occurredAt: "2026-09-12T17:35:00.000Z",
    action: "approved",
    targetToken: "conversation",
    targetIds: ["cbc3f410-ca7d-406d-b7c3-0d5d3821bc2e"],
    dataClass: "private",
    purpose: "security_incident",
    justification:
      "Ransomware containment: this thread holds the last known-good export link.",
    granted: true,
    denialReason: null,
    actorUserId: "4cf62e4e-2679-484f-b652-034e697418df",
    actorLabel: "arman@armansadeghi.com",
    granteeUserId: "34ed4fc3-c527-4819-99bf-15c26603b261",
    granteeLabel: "arman@titaniumsuccess.com",
    grantExpiresAt: "2026-09-12T19:35:00.000Z",
    organizationId: "f9cb3e35-2a65-4f2a-8525-088d6551071c",
    organizationLabel: "Titanium Success",
    basis: "emergency_door",
    isEmergencyDoor: true,
    subjectUserId: null,
    subjectLabel: null,
    ...overrides,
  };
}

describe("the access log's outcome model", () => {
  it("names the REQUESTER, not the approver, as the person who opened the record", () => {
    // The exact live `approved` row. `actor_user_id` is the approver — this is
    // not a quirk of the fixture, it is what `iam.emergency_door_approve`
    // writes, and it is why the row also carries `granted_to_user_id`.
    const approved = row({});

    expect(keyHolderLabel(approved)).toBe("arman@titaniumsuccess.com");
    expect(keyHolderLabel(approved)).not.toBe(approved.actorLabel);
    // And the approver is still shown — as the approver, which is true.
    expect(authorisedByLabel(approved)).toBe("arman@armansadeghi.com");
  });

  it("does not call a pending ask a refusal", () => {
    // `action='requested'`, `granted=false`, `denial_reason=null` — the live
    // shape of an ask that was subsequently APPROVED.
    const asked = row({
      action: "requested",
      granted: false,
      denialReason: null,
      grantExpiresAt: null,
    });

    expect(accessLogOutcome(asked)).toBe("asked");
    expect(accessLogOutcome(asked)).not.toBe("refused");
    expect(accessLogBadge(accessLogOutcome(asked))).toBe("Asked");
    expect(accessLogVerb(accessLogOutcome(asked))).toBe("asked to open");
  });

  it("never invents a refusal reason for a row that was not refused", () => {
    const asked = row({ action: "requested", granted: false, denialReason: null });
    // The old screen rendered `purposeLabel(entry.denialReason)` here, whose
    // null branch is the string "No reason recorded" — a fabricated answer to
    // a question ("why was it refused?") nobody had asked.
    expect(asked.denialReason).toBeNull();
    expect(accessLogOutcome(asked)).not.toBe("refused");
  });

  it("still reports a real refusal as refused, with the door's own words", () => {
    const denied = row({
      action: "denied",
      granted: false,
      denialReason: "the person who asked cannot also be the person who approves",
      grantExpiresAt: null,
    });

    expect(accessLogOutcome(denied)).toBe("refused");
    expect(accessLogBadge(accessLogOutcome(denied))).toBe("Refused");
    expect(denied.denialReason).toContain("cannot also be");
  });

  it("treats a lapsed request as lapsed, not as a refusal", () => {
    const lapsed = row({ action: "expired", granted: false, grantExpiresAt: null });
    expect(accessLogOutcome(lapsed)).toBe("lapsed");
  });

  it("shows only one person on a one-person confidential open", () => {
    // `read` is the `confidential` path: one organization admin, and the actor
    // and the grantee are the same human. Naming an "approved by" there would
    // invent a second person who does not exist.
    const oneAdmin = row({
      action: "read",
      dataClass: "confidential",
      actorUserId: "34ed4fc3-c527-4819-99bf-15c26603b261",
      actorLabel: "arman@titaniumsuccess.com",
    });

    expect(accessLogOutcome(oneAdmin)).toBe("granted");
    expect(keyHolderLabel(oneAdmin)).toBe("arman@titaniumsuccess.com");
    expect(authorisedByLabel(oneAdmin)).toBeNull();
  });

  it("says it does not know rather than naming the nearest person", () => {
    // The verifier deleted the request rows at cleanup, which is correct — so
    // one historical `approved` row can no longer say who held its key. The
    // honest value is null, and the page must render words, not a name.
    const unrecoverable = row({ granteeUserId: null, granteeLabel: null });
    expect(keyHolderLabel(unrecoverable)).toBe("Someone we can no longer name");
    expect(keyHolderLabel(unrecoverable)).not.toBe(unrecoverable.actorLabel);
  });

  it("does not paint an action it has never heard of as a refusal", () => {
    // The database owns this vocabulary and may grow it. An unknown action
    // must degrade to something neutral — never into a red card accusing
    // somebody of being turned away.
    const future = row({ action: "some_future_action", granted: false });
    expect(accessLogOutcome(future)).not.toBe("refused");
  });
});
