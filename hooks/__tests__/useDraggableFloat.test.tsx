/** @jest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDraggableFloat } from "../useDraggableFloat";

function Fixture({ visible }: { visible: boolean }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const float = useDraggableFloat({
    storageKey: "test.draggable-float",
    element,
    anchor: { bottom: "1rem", right: "1rem" },
  });

  if (!visible) return null;
  return (
    <div
      ref={(node) => {
        if (node) {
          Object.defineProperties(node, {
            offsetWidth: { configurable: true, value: 300 },
            offsetHeight: { configurable: true, value: 200 },
          });
          node.getBoundingClientRect = () =>
            ({ left: 16, top: 16, right: 316, bottom: 216, width: 300, height: 200 }) as DOMRect;
        }
        setElement(node);
      }}
      style={float.style}
    />
  );
}

describe("useDraggableFloat", () => {
  let container: HTMLDivElement;
  let root: Root;
  const initialWidth = window.innerWidth;
  const initialHeight = window.innerHeight;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: initialWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: initialHeight });
  });

  it("re-clamps a saved position after a conditional surface becomes measurable", async () => {
    window.localStorage.setItem("test.draggable-float", JSON.stringify({ x: 999, y: 999 }));

    await act(async () => root.render(<Fixture visible={false} />));
    await act(async () => root.render(<Fixture visible />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const surface = container.firstElementChild as HTMLElement;
    expect(surface.style.left).toBe("192px");
    expect(surface.style.top).toBe("192px");
  });
});
