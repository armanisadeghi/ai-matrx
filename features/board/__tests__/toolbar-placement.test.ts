import { placeToolbar, type Box } from "../engine/toolbar-placement";

const area = { w: 1200, h: 800 };
const insets = { top: 56, right: 0, bottom: 0, left: 0 };
const minimap: Box = { l: 984, t: 652, r: 1184, b: 784 };
const hud: Box = { l: 16, t: 740, r: 300, b: 784 };
const toolbar = { w: 700, h: 40 };
const touch = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const box = (p: { left: number; top: number }): Box => ({ l: p.left, t: p.top, r: p.left + toolbar.w, b: p.top + toolbar.h });

describe("the selection toolbar never covers board chrome", () => {
  it("a selection low in the bottom-right slides the toolbar clear of the minimap", () => {
    const sel: Box = { l: 900, t: 700, r: 1150, b: 780 };
    const p = placeToolbar({ selection: sel, toolbar, area, insets, avoid: [minimap, hud] });
    expect(touch(box(p), minimap)).toBe(false);
    expect(touch(box(p), hud)).toBe(false);
  });

  it("a select-all selection (whole board) keeps clear of both corners", () => {
    const sel: Box = { l: 0, t: 0, r: 1200, b: 800 };
    const p = placeToolbar({ selection: sel, toolbar, area, insets, avoid: [minimap, hud] });
    expect(touch(box(p), minimap)).toBe(false);
    expect(touch(box(p), hud)).toBe(false);
    expect(p.top).toBeGreaterThanOrEqual(insets.top);
  });

  it("with no chrome in the way it sits centred above the selection", () => {
    const sel: Box = { l: 400, t: 300, r: 600, b: 400 };
    const p = placeToolbar({ selection: sel, toolbar, area, insets, avoid: [] });
    expect(p.top).toBe(300 - 12 - 40);
    expect(p.left).toBe(500 - 350);
  });
});
