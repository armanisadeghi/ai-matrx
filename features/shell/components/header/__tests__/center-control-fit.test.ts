/**
 * A center control (the chat's Chat · Work · Advanced switch) picks its form
 * from the HEADER ROW's measured room, never the viewport (2026-10-03: with the
 * canvas open the full switch drew over the page's actions at a 1440px window).
 */
import { chooseCenterFit } from "../useCenterControlFit";

// Measured live on /chat/<id>: full switch 222px, one-button trigger 70px.
const SWITCH = [222, 70];

describe("chooseCenterFit", () => {
  it("draws the full switch when the centered slot holds it", () => {
    expect(chooseCenterFit(SWITCH, 400, 600)).toEqual({ index: 0, inflow: false });
  });

  it("collapses to the one-button form when the centered slot cannot hold the full switch", () => {
    expect(chooseCenterFit(SWITCH, 150, 180)).toEqual({ index: 1, inflow: false });
  });

  it("leaves the true center (in flow) before it gives up — a 0px centered slot never hides it", () => {
    expect(chooseCenterFit(SWITCH, 0, 240)).toEqual({ index: 0, inflow: true });
    expect(chooseCenterFit(SWITCH, 0, 100)).toEqual({ index: 1, inflow: true });
  });

  it("draws nothing rather than a clipped stub when not even the trigger fits", () => {
    expect(chooseCenterFit(SWITCH, 20, 40)).toEqual({ index: -1, inflow: false });
  });

  it("never picks an unmeasured (0px) candidate", () => {
    expect(chooseCenterFit([0, 70], 400, 400)).toEqual({ index: 1, inflow: false });
  });
});
