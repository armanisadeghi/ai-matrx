// F-20 item 3 (VERIFY-B1-B2-R2 N7 / break I): the timeline asserted "Associated
// with" from the row's own columns, so a refused edge was shown as an
// association forever and the only trace was a toast. This is the comparison the
// surface renders instead.

import { gmailAssociationStanding } from "./sent-record-associations";

describe("gmailAssociationStanding", () => {
  const intended = [
    { type: "party" as const, id: "party-ada", label: "Ada Lovelace" },
    { type: "crm_deal" as const, id: "deal-1", label: "Clinic rollout" },
    { type: "project" as const, id: "project-1" },
  ];

  it("names the edge that is missing instead of asserting it", () => {
    const standing = gmailAssociationStanding(intended, [
      { otherType: "party", otherId: "party-ada", role: "gmail_send" },
    ]);
    expect(standing.linked.map((t) => t.id)).toEqual(["party-ada"]);
    expect(standing.missing.map((t) => t.id)).toEqual(["deal-1", "project-1"]);
  });

  it("counts an edge to the same target under another role as linked", () => {
    const standing = gmailAssociationStanding(
      [{ type: "party", id: "party-ada" }],
      [{ otherType: "party", otherId: "party-ada", role: null }],
    );
    expect(standing.missing).toEqual([]);
  });

  it("says everything is linked when every edge landed", () => {
    const standing = gmailAssociationStanding(intended, [
      { otherType: "party", otherId: "party-ada", role: "gmail_send" },
      { otherType: "crm_deal", otherId: "deal-1", role: "gmail_send" },
      { otherType: "project", otherId: "project-1", role: "gmail_send" },
    ]);
    expect(standing.missing).toEqual([]);
    expect(standing.linked).toHaveLength(3);
  });
});
