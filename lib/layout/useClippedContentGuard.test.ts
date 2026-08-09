/**
 * The clipped-content guard's verdict must hold in exactly the three shapes
 * that matter: a broken chain (clipped, silent, a defect), a healthy scroller
 * (reachable, silent by design), and a fitting element (nothing wrong).
 */

import { findClippedOverflow } from "@/lib/layout/useClippedContentGuard";

function stubRect(element: HTMLElement, top: number, bottom: number): void {
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** ancestor(overflowY, bottom) → child(bottom) inside it, attached to body. */
function buildTree(
  overflowY: string,
  ancestorBottom: number,
  childBottom: number,
): HTMLElement {
  document.body.innerHTML = "";
  const ancestor = document.createElement("div");
  ancestor.style.overflowY = overflowY;
  const child = document.createElement("div");
  ancestor.appendChild(child);
  document.body.appendChild(ancestor);
  stubRect(ancestor, 0, ancestorBottom);
  stubRect(child, 0, childBottom);
  return child;
}

describe("findClippedOverflow", () => {
  it("reports a broken chain: the element outgrows a clipping ancestor", () => {
    const finding = findClippedOverflow(buildTree("hidden", 500, 1400));
    expect(finding).not.toBeNull();
    expect(finding?.overflowPx).toBe(900);
  });

  it("stays silent when the nearest constraining ancestor scrolls", () => {
    // Same overflowing geometry — but the rows are reachable, so it is fine.
    expect(findClippedOverflow(buildTree("auto", 500, 1400))).toBeNull();
    expect(findClippedOverflow(buildTree("scroll", 500, 1400))).toBeNull();
  });

  it("stays silent when the element fits, and tolerates sub-pixel overhang", () => {
    expect(findClippedOverflow(buildTree("hidden", 500, 480))).toBeNull();
    expect(findClippedOverflow(buildTree("hidden", 500, 503))).toBeNull();
  });

  it("stays silent when nothing above it constrains overflow", () => {
    expect(findClippedOverflow(buildTree("visible", 500, 1400))).toBeNull();
  });
});
