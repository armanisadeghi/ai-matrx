/** @jest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDraggableFloat } from "../useDraggableFloat";

const FOOTER_EXCLUSION = { selector: "[data-testid='table-footer']" } as const;
let footerTop = 350;

function Fixture({ visible, withFooter = false }: { visible: boolean; withFooter?: boolean }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null);
  const float = useDraggableFloat({
    storageKey: "test.draggable-float",
    element,
    anchor: { bottom: "1rem", right: "1rem" },
    exclusion: FOOTER_EXCLUSION,
  });

  if (!visible) return null;
  return (
    <>
      {withFooter && (
        <div
          data-testid="table-footer"
          ref={(node) => {
            if (node) {
              node.getBoundingClientRect = () =>
                ({ left: 0, top: footerTop, right: 500, bottom: footerTop + 40, width: 500, height: 40 }) as DOMRect;
            }
          }}
        />
      )}
      <div
        ref={(node) => {
          if (node) {
            Object.defineProperties(node, {
              offsetWidth: { configurable: true, value: 300 },
              offsetHeight: { configurable: true, value: 200 },
            });
            node.getBoundingClientRect = () => {
              const left = Number.parseFloat(node.style.left) || 16;
              const top = Number.parseFloat(node.style.top) || 16;
              return { left, top, right: left + 300, bottom: top + 200, width: 300, height: 200 } as DOMRect;
            };
          }
          setElement(node);
        }}
        style={float.style}
      >
        <button data-testid="drag-handle" type="button" {...float.dragHandleProps} />
      </div>
    </>
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
    footerTop = 350;
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

  it("moves only an unsafe saved position clear of an opted-in footer", async () => {
    window.localStorage.setItem("test.draggable-float", JSON.stringify({ x: 192, y: 342 }));

    await act(async () => root.render(<Fixture visible withFooter />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const surface = container.querySelector("[style]") as HTMLElement;
    expect(surface.style.left).toBe("192px");
    expect(surface.style.top).toBe("142px");
  });

  it("preserves a safe saved position when the footer exclusion is enabled", async () => {
    window.localStorage.setItem("test.draggable-float", JSON.stringify({ x: 192, y: 100 }));

    await act(async () => root.render(<Fixture visible withFooter />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const surface = container.querySelector("[style]") as HTMLElement;
    expect(surface.style.left).toBe("192px");
    expect(surface.style.top).toBe("100px");
  });

  it("restores a preferred position when a late footer mounts and then leaves", async () => {
    footerTop = 300;
    window.localStorage.setItem("test.draggable-float", JSON.stringify({ x: 192, y: 150 }));

    await act(async () => root.render(<Fixture visible />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const surface = container.querySelector("[style]") as HTMLElement;
    expect(surface.style.top).toBe("150px");

    await act(async () => root.render(<Fixture visible withFooter />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(surface.style.top).toBe("92px");

    await act(async () => root.render(<Fixture visible />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(surface.style.top).toBe("150px");
  });

  it("reconciles a moving footer after a captured scroll event", async () => {
    footerTop = 300;
    window.localStorage.setItem("test.draggable-float", JSON.stringify({ x: 192, y: 150 }));

    await act(async () => root.render(<Fixture visible withFooter />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const surface = container.querySelector("[style]") as HTMLElement;
    expect(surface.style.top).toBe("92px");

    footerTop = 360;
    await act(async () => {
      window.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(surface.style.top).toBe("150px");

    footerTop = 300;
    await act(async () => {
      window.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(surface.style.top).toBe("92px");
  });

  it("keeps the person's preferred drag coordinate while temporarily clearing a footer", async () => {
    footerTop = 300;
    await act(async () => root.render(<Fixture visible withFooter />));

    const surface = container.querySelector("[style]") as HTMLElement;
    const handle = container.querySelector('[data-testid="drag-handle"]') as HTMLButtonElement;
    await act(async () => {
      handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 20, clientY: 20 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 196, clientY: 154 }));
      window.dispatchEvent(new MouseEvent("pointerup"));
    });

    expect(surface.style.left).toBe("192px");
    expect(surface.style.top).toBe("92px");
    expect(window.localStorage.getItem("test.draggable-float")).toBe(JSON.stringify({ x: 192, y: 150 }));

    await act(async () => root.render(<Fixture visible />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(surface.style.top).toBe("150px");
  });
});
