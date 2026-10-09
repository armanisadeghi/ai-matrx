import { cameraShowsContent } from "../engine/camera";

describe("a restored camera that shows none of the board is lost", () => {
  const size = { w: 1000, h: 700 };
  const rects = [
    { x: 0, y: 0, w: 600, h: 500 },
    { x: 700, y: 0, w: 600, h: 500 },
  ];
  it("shows content when any tile is in view", () => {
    expect(cameraShowsContent({ x: 0, y: 0, z: 1 }, size, rects)).toBe(true);
  });
  it("is lost when every tile is off screen (the Data Destruction case: -887,-894 at 1.157)", () => {
    expect(cameraShowsContent({ x: -887, y: -894, z: 1.157 }, size, rects)).toBe(false);
  });
  it("is lost when only a sliver of one tile is in view (the pane's left edge)", () => {
    expect(cameraShowsContent({ x: -60, y: 0, z: 1 }, size, [{ x: -500, y: 0, w: 580, h: 500 }])).toBe(false);
  });
  it("shows content when a tile bigger than the screen fills it", () => {
    expect(cameraShowsContent({ x: 0, y: 0, z: 1 }, { w: 400, h: 300 }, [{ x: -100, y: -100, w: 2000, h: 2000 }])).toBe(true);
  });
  it("an empty board is never lost", () => {
    expect(cameraShowsContent({ x: 5000, y: 5000, z: 1 }, size, [])).toBe(true);
  });
});
