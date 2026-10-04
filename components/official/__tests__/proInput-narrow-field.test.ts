import {
  hoverRevealsCluster,
  PRO_INPUT_NARROW_FIELD_PX,
} from "../proInputReservedPadding";

describe("a narrow ProInput never lets a hover steal the click", () => {
  it("a board tile's 206px task-add field reveals its cluster on focus, not hover", () => {
    expect(hoverRevealsCluster(206)).toBe(false);
  });
  it("a wide field and an unmeasured one keep the hover reveal", () => {
    expect(hoverRevealsCluster(PRO_INPUT_NARROW_FIELD_PX)).toBe(true);
    expect(hoverRevealsCluster(448)).toBe(true);
    expect(hoverRevealsCluster(0)).toBe(true);
  });
});
