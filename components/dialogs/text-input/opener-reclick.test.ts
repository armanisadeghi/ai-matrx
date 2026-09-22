/**
 * FORCING FUNCTION: a re-click of the button that opened a dialog is not an
 * outside click.
 *
 * THE DEFECT (live on www.aimatrx.com, 2026-09-22). The battle page's
 * "Save as…" was reported dead — four clicks, no dialog, no toast, no
 * overlay. Click-by-click against the live site the dialog count went
 * 1 → 0 → 1: the trigger sits under the dialog's own scrim, so every second
 * click dismissed what the one before opened, and an even number of clicks
 * left the page looking untouched.
 *
 * THE SEAM. Radix's dismissable layer does not arm its outside-pointer
 * listener under jsdom (verified: a raw Dialog never fires
 * `onPointerDownOutside` there), so the wiring itself is proven in a real
 * browser — on localhost and again on the live site. What IS testable, and is
 * where the bug lives, is the decision: with the scrim swallowing the event,
 * does this point belong to the opener? Both obvious answers are red here —
 * `contains(event.target)` (the target is the scrim) and a hit test (a modal
 * dialog puts `pointer-events: none` on the body, so the opener vanishes from
 * the stack).
 */

import { isPointOnOpener } from "./opener-reclick";

function openerAt(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const button = document.createElement("button");
  button.textContent = "Save as...";
  document.body.appendChild(button);
  button.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return button;
}

/** The real toolbar geometry of "Save as…" measured on the battle page. */
const SAVE_AS = { left: 602, top: 91, width: 57, height: 20 };

describe("isPointOnOpener", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is true for the click the scrim swallowed on the way to the opener", () => {
    const opener = openerAt(SAVE_AS);
    // The point a person actually clicks: the middle of "Save as…".
    expect(isPointOnOpener(opener, { clientX: 630, clientY: 101 })).toBe(true);
  });

  it("is true on the opener's edges", () => {
    const opener = openerAt(SAVE_AS);
    expect(isPointOnOpener(opener, { clientX: 602, clientY: 91 })).toBe(true);
    expect(isPointOnOpener(opener, { clientX: 659, clientY: 111 })).toBe(true);
  });

  it("is false a few pixels past the opener — a real outside click", () => {
    const opener = openerAt(SAVE_AS);
    expect(isPointOnOpener(opener, { clientX: 661, clientY: 101 })).toBe(false);
    expect(isPointOnOpener(opener, { clientX: 630, clientY: 400 })).toBe(false);
  });

  it("is false once the opener has left the DOM", () => {
    const opener = openerAt(SAVE_AS);
    opener.remove();
    expect(isPointOnOpener(opener, { clientX: 630, clientY: 101 })).toBe(false);
  });

  it("is false for an opener with no box (hidden toolbar)", () => {
    const opener = openerAt({ left: 0, top: 0, width: 0, height: 0 });
    expect(isPointOnOpener(opener, { clientX: 0, clientY: 0 })).toBe(false);
  });

  it("is false for a keyboard dismissal, which reports no point", () => {
    const opener = openerAt(SAVE_AS);
    expect(isPointOnOpener(opener, {})).toBe(false);
    expect(isPointOnOpener(opener, { clientX: 0, clientY: 0 })).toBe(false);
  });

  it("is false when nothing opened the dialog", () => {
    expect(isPointOnOpener(null, { clientX: 630, clientY: 101 })).toBe(false);
  });
});
