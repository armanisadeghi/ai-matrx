import { titleMaxWidth } from "../RouteHeader";

describe("titleMaxWidth — the title yields to the center nav only when the nav can draw", () => {
  it("no nav → no cap", () => {
    expect(titleMaxWidth(800, 200, 0, 88)).toBeNull();
  });
  it("caps the title so the nav's smallest trigger keeps its room", () => {
    // 800 - 200 - 46 - 16 = 538
    expect(titleMaxWidth(800, 200, 46, 88)).toBe(538);
  });
  it("a cap exactly at the floor still leaves the trigger its room", () => {
    expect(titleMaxWidth(361, 211, 46, 88)).toBe(88);
  });
  it("when even a floored title leaves no room for the trigger, the title is not squeezed for an empty center", () => {
    // /war-room/<id> beside a 360px canvas: 355 - 211 - 46 - 16 = 82 < 88.
    // The old rule clamped to the floor (88) and drew a blank center.
    expect(titleMaxWidth(355, 211, 46, 88)).toBeNull();
  });
});
