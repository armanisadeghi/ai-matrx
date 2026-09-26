/**
 * ALC-15 verifier finding 3: /data/[id] had no ⋯ — its one menu opened only by
 * right-click. Break it names: a ⋯ that does not open the SURFACE's menu (the
 * grid's shell, table-level, anchored at the button) → red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { OpenSurfaceMenuButton } from "../OpenSurfaceMenuButton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("⋯ opens the surface's own menu, on the surface element, at the button", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const opened: { target: string; x: number; y: number }[] = [];
  function Page() {
    const grid = React.useRef<HTMLDivElement>(null);
    return (
      <div onContextMenu={(e) => opened.push({ target: (e.target as HTMLElement).getAttribute("data-name") ?? "", x: e.clientX, y: e.clientY })}>
        <div className="toolbar">
          <OpenSurfaceMenuButton getSurface={() => grid.current} label="Table actions" />
        </div>
        <div ref={grid} data-name="grid" role="grid" />
      </div>
    );
  }
  const root = createRoot(host);
  act(() => root.render(<Page />));
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Table actions"]');
  act(() => button?.click());
  expect(opened).toHaveLength(1);
  expect(opened[0]?.target).toBe("grid");
  act(() => root.unmount());
  host.remove();
});
