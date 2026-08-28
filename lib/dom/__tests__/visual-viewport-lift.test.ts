import { calculateVisualViewportLift } from "../visual-viewport-lift";

describe("calculateVisualViewportLift", () => {
  it("does not move a surface that already fits above the keyboard", () => {
    expect(
      calculateVisualViewportLift({
        surfaceTop: 100,
        surfaceBottom: 340,
        currentLift: 0,
        viewportTop: 0,
        viewportHeight: 400,
      }),
    ).toBe(0);
  });

  it("lifts a covered surface by exactly its visual-viewport overlap", () => {
    expect(
      calculateVisualViewportLift({
        surfaceTop: 180,
        surfaceBottom: 470,
        currentLift: 0,
        viewportTop: 0,
        viewportHeight: 400,
      }),
    ).toBe(82);
  });

  it("converges when the measured rect already includes the previous lift", () => {
    expect(
      calculateVisualViewportLift({
        surfaceTop: 98,
        surfaceBottom: 388,
        currentLift: 82,
        viewportTop: 0,
        viewportHeight: 400,
      }),
    ).toBe(82);
  });

  it("never lifts a surface above the visible viewport", () => {
    expect(
      calculateVisualViewportLift({
        surfaceTop: 20,
        surfaceBottom: 470,
        currentLift: 0,
        viewportTop: 0,
        viewportHeight: 400,
      }),
    ).toBe(8);
  });

  it("accounts for a visual viewport offset after Safari chrome scrolls", () => {
    expect(
      calculateVisualViewportLift({
        surfaceTop: 260,
        surfaceBottom: 540,
        currentLift: 0,
        viewportTop: 80,
        viewportHeight: 400,
      }),
    ).toBe(72);
  });
});
