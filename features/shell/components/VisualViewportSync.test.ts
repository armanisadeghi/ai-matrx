import { calculateKeyboardInset } from "./VisualViewportSync";

describe("calculateKeyboardInset", () => {
  it("returns the covered bottom area for an overlay keyboard", () => {
    expect(
      calculateKeyboardInset({
        innerHeight: 900,
        viewportHeight: 520,
        viewportOffsetTop: 0,
        viewportScale: 1,
        textEntryFocused: true,
      }),
    ).toBe(380);
  });

  it("does not add an inset when the layout viewport resizes with the keyboard", () => {
    expect(
      calculateKeyboardInset({
        innerHeight: 520,
        viewportHeight: 520,
        viewportOffsetTop: 0,
        viewportScale: 1,
        textEntryFocused: true,
      }),
    ).toBe(0);
  });

  it("ignores viewport changes without a focused text-entry control", () => {
    expect(
      calculateKeyboardInset({
        innerHeight: 900,
        viewportHeight: 520,
        viewportOffsetTop: 0,
        viewportScale: 1,
        textEntryFocused: false,
      }),
    ).toBe(0);
  });

  it("ignores pinch zoom and small browser-toolbar movement", () => {
    expect(
      calculateKeyboardInset({
        innerHeight: 900,
        viewportHeight: 520,
        viewportOffsetTop: 0,
        viewportScale: 1.5,
        textEntryFocused: true,
      }),
    ).toBe(0);
    expect(
      calculateKeyboardInset({
        innerHeight: 900,
        viewportHeight: 850,
        viewportOffsetTop: 0,
        viewportScale: 1,
        textEntryFocused: true,
      }),
    ).toBe(0);
  });
});
