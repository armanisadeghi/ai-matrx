import { discoveryDisposition, feedbackInvitation, type DiscoveryEvidence } from "./userResearch";

const clear: DiscoveryEvidence = { category: "real_user", contactState: "not_contacted", banned: false, kind: "person", lastActivity: "2026-06-01T00:00:00Z", sharedOrganizations: [], membershipsChecked: true, affiliationsChecked: true, invitationsChecked: true, suppressionChecked: true, partyResolved: true };
describe("early-user discovery relationship precedence", () => {
  it.each(["employee", "former_employee", "friend", "family", "test", "owner", "bot"] as const)("keeps owner-confirmed %s out of external discovery", category => expect(discoveryDisposition({ ...clear, category })).toBe("known"));
  it.each(["membershipsChecked", "affiliationsChecked", "invitationsChecked", "suppressionChecked", "partyResolved"] as const)("holds unread %s", key => expect(discoveryDisposition({ ...clear, [key]: false })).toBe("needs_review"));
  it("holds shared organizations rather than guessing employment", () => expect(discoveryDisposition({ ...clear, sharedOrganizations: ["owner-org"] })).toBe("needs_review"));
  it("holds blocked and already contacted accounts", () => {
    expect(discoveryDisposition({ ...clear, banned: true })).toBe("hold");
    for (const contactState of ["contacted", "replied", "declined", "opted_out", "hold", "trial_active"] as const) expect(discoveryDisposition({ ...clear, contactState })).toBe("hold");
  });
  it("uses inclusive June cutoff on activity, independent of signup", () => {
    expect(discoveryDisposition(clear)).toBe("candidate");
    expect(discoveryDisposition({ ...clear, lastActivity: "2026-05-31T23:59:59.999Z" })).toBe("historical");
  });
  it("does not infer external status from human-looking activity", () => expect(discoveryDisposition({ ...clear, category: "unknown" })).toBe("needs_review"));
  it("accepts only coarse feature labels and preserves founder voice", () => {
    const draft = feedbackInvitation("Jason Milakovic", "Entry", "workspace");
    expect(draft).toContain("Hi Jason. This is Arman, not one of the agents. lol.");
    expect(draft).toContain("three months of Entry for free");
    expect(draft).toContain("I noticed you tried our workspace.");
  });
});
