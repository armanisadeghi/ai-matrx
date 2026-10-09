import { ownTrackingState } from "../own-accounts";
import type { AccountRow } from "../types";

function row(over: Partial<AccountRow>): AccountRow {
  return {
    rowId: "r",
    platform: "instagram",
    trackedAccountId: null,
    propertyId: "p1",
    trackable: true,
    ...over,
  } as AccountRow;
}

describe("ownTrackingState (KPI empty state)", () => {
  it("offers Track own accounts when a wired platform is untracked", () => {
    const s = ownTrackingState([row({ platform: "reddit", trackable: false }), row({ rowId: "b" })]);
    expect(s.kind).toBe("trackable");
    if (s.kind === "trackable") expect(s.rows).toHaveLength(1);
  });

  it("says tracking is coming when every own property is on an unwired platform (Harbor Light: two Reddit)", () => {
    const s = ownTrackingState([
      row({ rowId: "a", platform: "reddit", trackable: false }),
      row({ rowId: "b", platform: "reddit", trackable: false }),
    ]);
    expect(s).toEqual({ kind: "coming", platforms: ["reddit"] });
  });

  it("falls back to add-an-account when the brand owns nothing untracked", () => {
    expect(ownTrackingState([]).kind).toBe("none");
    expect(ownTrackingState([row({ trackedAccountId: "t1" })]).kind).toBe("none");
  });
});
