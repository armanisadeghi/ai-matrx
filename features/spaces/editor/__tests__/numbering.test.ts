import { listMarker } from "../list-marker";

describe("Notion list numbering by depth (C4)", () => {
  it("cycles 1. → a. → i. → 1.", () => {
    expect([listMarker(1, 0), listMarker(2, 1), listMarker(3, 2), listMarker(4, 3)]).toEqual(["1.", "b.", "iii.", "4."]);
  });
  it("letters past z and roman numerals past ten", () => {
    expect(listMarker(27, 1)).toBe("aa.");
    expect(listMarker(14, 2)).toBe("xiv.");
  });
});
