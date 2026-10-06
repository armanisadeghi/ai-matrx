import { defaultPicks, membersToHold, sharedOutlets } from "../OutletSendStep";
import type { OutletGroup, RecipientFit } from "../service";

const groups: OutletGroup[] = [
  {
    outlet_party_id: "wired",
    outlet_name: "Wired",
    recipient_party_ids: ["a", "b", "c"],
    pitch_first_party_id: "b",
    held_party_ids: ["a", "c"],
    hold_until: "2026-10-20T12:00:00+00:00",
    why: "Best fit at this outlet (fit).",
  },
  {
    outlet_party_id: "verge",
    outlet_name: "The Verge",
    recipient_party_ids: ["d"],
    pitch_first_party_id: "d",
    hold_until: null,
    why: "Only recipient at this outlet.",
  },
];
const recipients: RecipientFit[] = ["a", "b", "c", "d"].map((p) => ({
  party_id: p,
  member_id: `m-${p}`,
  basis: "none",
}));

describe("outlet send step", () => {
  it("only outlets with two or more recipients need a pick", () => {
    expect(sharedOutlets(groups).map((g) => g.outlet_party_id)).toEqual(["wired"]);
  });

  it("defaults to the server's pitch-first pick and holds the rest until the live window ends", () => {
    const picks = defaultPicks(groups);
    expect(picks).toEqual({ firstByOutlet: { wired: "b" }, holdOthers: true });
    expect(membersToHold(groups, recipients, picks)).toEqual([
      { memberId: "m-a", until: "2026-10-20T12:00:00+00:00" },
      { memberId: "m-c", until: "2026-10-20T12:00:00+00:00" },
    ]);
  });

  it("a person's own pick wins, and turning holding off holds no one", () => {
    const mine = { firstByOutlet: { wired: "c" }, holdOthers: true };
    expect(membersToHold(groups, recipients, mine).map((h) => h.memberId)).toEqual(["m-a", "m-b"]);
    expect(membersToHold(groups, recipients, { ...mine, holdOthers: false })).toEqual([]);
  });
});
