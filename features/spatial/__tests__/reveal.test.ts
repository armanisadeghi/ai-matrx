import { panToReveal, shouldReveal } from "../engine/reveal";

const view = { left: 0, top: 72, right: 1000, bottom: 700 }; // board area minus chrome insets
const rect = (left: number, top: number, w = 100, h = 30) => ({ left, top, right: left + w, bottom: top + h });

describe("panToReveal — the smallest pan that brings a focused element into view", () => {
  it("does nothing when the element is already in view (with the margin)", () => {
    expect(panToReveal(rect(400, 300), view, 24)).toEqual({ dx: 0, dy: 0 });
  });

  it("an element past the right edge pans the board left by exactly the overflow plus margin", () => {
    // right edge 1150 → must end at 1000 - 24 = 976 → dx = -174
    expect(panToReveal(rect(1050, 300), view, 24)).toEqual({ dx: -174, dy: 0 });
  });

  it("an element past the left edge pans right", () => {
    expect(panToReveal(rect(-80, 300), view, 24)).toEqual({ dx: 104, dy: 0 });
  });

  it("below the bottom / above the top, including the chrome inset", () => {
    expect(panToReveal(rect(400, 690), view, 24)).toEqual({ dx: 0, dy: -44 });
    expect(panToReveal(rect(400, 60), view, 24)).toEqual({ dx: 0, dy: 36 });
  });

  it("both axes at once", () => {
    expect(panToReveal(rect(1050, 690), view, 24)).toEqual({ dx: -174, dy: -44 });
  });

  it("an element larger than the view aligns its start edge (Excel)", () => {
    expect(panToReveal(rect(-500, 300, 3000), view, 24)).toEqual({ dx: 524, dy: 0 });
    expect(panToReveal(rect(200, 300, 3000), view, 24)).toEqual({ dx: -176, dy: 0 });
  });

  it("never returns a zoom — only a pan", () => {
    expect(Object.keys(panToReveal(rect(1050, 690), view, 24)).sort()).toEqual(["dx", "dy"]);
  });
});


describe("shouldReveal — when a focus change may move the camera", () => {
  const base = { inTile: true, pointersDown: 0, msSincePress: 5000 };
  it("keyboard focus moves inside a tile reveal", () => {
    expect(shouldReveal(base)).toBe(true);
  });
  it("a mouse click never pans (the element is on screen by definition)", () => {
    expect(shouldReveal({ ...base, msSincePress: 40 })).toBe(false);
  });
  it("never during a drag, a pan or a pinch", () => {
    expect(shouldReveal({ ...base, pointersDown: 1 })).toBe(false);
  });
  it("focus outside tiles (chrome, the chat) is not the board's", () => {
    expect(shouldReveal({ ...base, inTile: false })).toBe(false);
  });
});
