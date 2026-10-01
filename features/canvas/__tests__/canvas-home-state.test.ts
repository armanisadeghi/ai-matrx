/**
 * THE CANVAS HOME — the empty canvas is never a dead end.
 *
 * Owner, 2026-09-30: the header Canvas control is "permanently there, always
 * available and clickable". With nothing on the canvas it opens its HOME
 * (`CanvasHomeSheet`: saved items + the Board). These pin the slice half:
 * home opens and closes, the ⌘\ toggle reaches it when the canvas is empty and
 * behaves exactly as before when it is not, and opening ANY item hands over
 * from home to the item canvas, so the two are never on screen together.
 *
 * PROVEN FAILING BEFORE PASSING: remove the `state.homeOpen = false;` lines
 * that follow every `state.isOpen = true;` → "opening an item closes home"
 * RED; restore the old no-op `toggleCanvas` branch → "⌘\ on an empty canvas"
 * RED.
 */

import {
  canvasSlice,
  closeCanvas,
  closeCanvasHome,
  openArtifactInCanvas,
  openCanvas,
  openCanvasHome,
  toggleCanvas,
} from "@/features/canvas/redux/canvasSlice";

const reduce = canvasSlice.reducer;
const initial = () => reduce(undefined, { type: "@@init" });

describe("canvas home state", () => {
  it("opens and closes", () => {
    const opened = reduce(initial(), openCanvasHome());
    expect(opened.homeOpen).toBe(true);
    expect(opened.isOpen).toBe(false);
    expect(reduce(opened, closeCanvasHome()).homeOpen).toBe(false);
  });

  it("⌘\\ on an empty canvas toggles home", () => {
    const once = reduce(initial(), toggleCanvas());
    expect(once.homeOpen).toBe(true);
    expect(reduce(once, toggleCanvas()).homeOpen).toBe(false);
  });

  it("⌘\\ with an item behaves as before and never opens home", () => {
    let state = reduce(initial(), openCanvas({ type: "code", data: "x", metadata: { title: "a.py" } }));
    state = reduce(state, closeCanvas());
    state = reduce(state, toggleCanvas());
    expect(state.isOpen).toBe(true);
    expect(state.homeOpen).toBe(false);
  });

  it("opening an item closes home — both ways in", () => {
    const home = reduce(initial(), openCanvasHome());
    const viaContent = reduce(home, openCanvas({ type: "code", data: "x", metadata: { title: "a.py" } }));
    expect(viaContent.homeOpen).toBe(false);
    expect(viaContent.isOpen).toBe(true);

    const viaArtifact = reduce(
      home,
      openArtifactInCanvas({ artifactId: "11111111-1111-4111-8111-111111111111", type: "code" }),
    );
    expect(viaArtifact.homeOpen).toBe(false);
    expect(viaArtifact.isOpen).toBe(true);
  });
});
