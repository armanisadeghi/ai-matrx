/**
 * The clipped-content guard's verdict must hold across the whole ancestor
 * chain — including the two shapes where stopping at the FIRST constraining
 * ancestor would make the guard go silent on a real break: an `overflow: auto`
 * wrapper that grew instead of scrolling, and a clipper further up than the
 * first one.
 */

import { findClippedOverflow } from "@/lib/layout/useClippedContentGuard";

interface Spec {
  /** `overflow-y`; omit for the default (`visible`, constrains nothing). */
  overflowY?: string;
  bottom: number;
  /** Content height, for deciding whether an `auto` box really scrolls. */
  scrollHeight?: number;
}

function stubRect(element: HTMLElement, bottom: number): void {
  element.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom,
      left: 0,
      right: 100,
      width: 100,
      height: bottom,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * Builds outermost → innermost, returns the leaf. `clientHeight` mirrors the
 * box height, so `scrollHeight` alone decides whether a scroller scrolls.
 */
function buildChain(specs: Spec[], leafBottom: number): HTMLElement {
  document.body.innerHTML = "";
  let parent: HTMLElement = document.body;
  for (const spec of specs) {
    const node = document.createElement("div");
    if (spec.overflowY) node.style.overflowY = spec.overflowY;
    stubRect(node, spec.bottom);
    Object.defineProperty(node, "clientHeight", { value: spec.bottom });
    Object.defineProperty(node, "scrollHeight", {
      value: spec.scrollHeight ?? spec.bottom,
    });
    parent.appendChild(node);
    parent = node;
  }
  const leaf = document.createElement("div");
  stubRect(leaf, leafBottom);
  parent.appendChild(leaf);
  return leaf;
}

describe("findClippedOverflow", () => {
  it("reports a broken chain: the element outgrows a clipping ancestor", () => {
    const finding = findClippedOverflow(
      buildChain([{ overflowY: "hidden", bottom: 500 }], 1400),
    );
    expect(finding).not.toBeNull();
    expect(finding?.overflowPx).toBe(900);
  });

  it("stays silent when the nearest constraining ancestor really scrolls", () => {
    for (const overflowY of ["auto", "scroll"]) {
      expect(
        findClippedOverflow(
          buildChain([{ overflowY, bottom: 500, scrollHeight: 1400 }], 1400),
        ),
      ).toBeNull();
    }
  });

  it("stays silent when the element fits, and tolerates sub-pixel overhang", () => {
    expect(
      findClippedOverflow(buildChain([{ overflowY: "hidden", bottom: 500 }], 480)),
    ).toBeNull();
    expect(
      findClippedOverflow(buildChain([{ overflowY: "hidden", bottom: 500 }], 503)),
    ).toBeNull();
  });

  it("stays silent when nothing above it constrains overflow", () => {
    expect(findClippedOverflow(buildChain([{ bottom: 500 }], 1400))).toBeNull();
  });

  it("sees past an `auto` wrapper that grew instead of scrolling", () => {
    // The broken-chain signature: the `auto` box has no scrollport (its height
    // grew with its child), so the outer `hidden` box is what cuts the rows.
    const finding = findClippedOverflow(
      buildChain(
        [
          { overflowY: "hidden", bottom: 400 },
          { overflowY: "auto", bottom: 1400, scrollHeight: 1400 },
        ],
        1400,
      ),
    );
    expect(finding).not.toBeNull();
    expect(finding?.overflowPx).toBe(1000);
  });

  it("sees a clipping ancestor above the first one", () => {
    // The element fits its immediate `hidden` parent — but that parent is
    // itself cut by a shorter `hidden` ancestor above it.
    const finding = findClippedOverflow(
      buildChain(
        [
          { overflowY: "hidden", bottom: 300 },
          { overflowY: "hidden", bottom: 1000 },
        ],
        900,
      ),
    );
    expect(finding).not.toBeNull();
    expect(finding?.overflowPx).toBe(600);
  });

  it("treats a collapsed ancestor as intentional, not a broken chain", () => {
    expect(
      findClippedOverflow(buildChain([{ overflowY: "hidden", bottom: 0 }], 900)),
    ).toBeNull();
  });
});
