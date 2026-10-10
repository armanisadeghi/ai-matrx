import { BoardCameraStore, cameraIsUnreadable } from "../engine/camera-store";

// A phone cannot read a whole board at 5-15%: the first view opens on the first tile (top-left, one screen wide).
function open(size: { w: number; h: number }, rects: Array<{ x: number; y: number; w: number; h: number }>) {
  const store = new BoardCameraStore({ x: 0, y: 0, z: 0.6 });
  store.setSize(size);
  rects.forEach((r, i) => store.registerItem(`t${i}`, r));
  const fly = jest.spyOn(store, "flyTo").mockImplementation(() => undefined);
  store.fitOpening();
  return fly.mock.calls[0]?.[0];
}

const STUDIO = [
  { x: 1300, y: 0, w: 460, h: 420 },
  { x: 0, y: 0, w: 440, h: 168 },
  { x: 680, y: 0, w: 520, h: 640 },
];

describe("fitOpening", () => {
  it("on a phone opens on the first tile in reading order, readable and top-left", () => {
    const cam = open({ w: 375, h: 700 }, STUDIO)!;
    expect(cam.z).toBeGreaterThanOrEqual(0.5);
    expect(cam.x + 0 * cam.z).toBe(16); // the first tile's left edge sits one margin in
    expect(cam.y).toBe(16);
  });
  it("on a desktop view fits everything as before", () => {
    const cam = open({ w: 1400, h: 800 }, STUDIO)!;
    expect(cam.z).toBeGreaterThan(0.3);
    expect(cam.x).not.toBe(16);
  });
  it("on a phone a board that already fits readably keeps fit-all", () => {
    const cam = open({ w: 375, h: 700 }, [{ x: 0, y: 0, w: 300, h: 300 }])!;
    expect(cam.z).toBeGreaterThan(0.5);
  });
});

describe("cameraIsUnreadable", () => {
  it("reopens a saved 27% view on a phone, never on a desktop", () => {
    expect(cameraIsUnreadable({ z: 0.27 }, { w: 375 })).toBe(true);
    expect(cameraIsUnreadable({ z: 0.27 }, { w: 1280 })).toBe(false);
  });
  it("keeps a readable phone view", () => {
    expect(cameraIsUnreadable({ z: 0.7 }, { w: 375 })).toBe(false);
  });
});
