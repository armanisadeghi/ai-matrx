/**
 * A ROW THAT OVERFLOWS FOLDS (2026-10-06). A Compact input in a ~670px chat
 * column carried + · mic · live · scope · values | a long agent name · Text,
 * and "Text" was cut off at the right edge: the fold only fired under a fixed
 * 480px, so a wide-but-crowded row never folded. Now a row under the card that
 * overflows folds it too, and it unfolds only with clear room to spare.
 *
 * RED before: useComposerFold looked at width alone — 670px never folded.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useComposerFold } from "../composer/useComposerFold";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resize: (() => void) | null = null;
class TestResizeObserver {
  constructor(cb: () => void) {
    resize = cb;
  }
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = TestResizeObserver;

let width = 670;
let rowScroll = 700;
const rowClient = 660;

let folded = false;
function Probe() {
  const fold = useComposerFold();
  folded = fold.folded;
  return (
    <div
      ref={(node) => {
        if (node) node.getBoundingClientRect = () => ({ width }) as DOMRect;
        fold.ref(node);
      }}
    >
      <div
        data-composer-row=""
        ref={(node) => {
          if (!node) return;
          Object.defineProperty(node, "scrollWidth", { configurable: true, get: () => rowScroll });
          Object.defineProperty(node, "clientWidth", { configurable: true, get: () => rowClient });
        }}
      />
    </div>
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("folds a wide composer whose row overflows, and unfolds only with clear room", () => {
  act(() => root.render(<Probe />));
  act(() => resize?.());
  expect(folded).toBe(true);

  // Folded, the row fits again — it must NOT flip back at the same width.
  rowScroll = 600;
  act(() => resize?.());
  expect(folded).toBe(true);

  // Clear room past the width that forced the fold: unfold.
  width = 800;
  act(() => resize?.());
  expect(folded).toBe(false);
});

it("still folds under 480px even when nothing overflows", () => {
  width = 470;
  rowScroll = 400;
  act(() => root.render(<Probe />));
  act(() => resize?.());
  expect(folded).toBe(true);
});
