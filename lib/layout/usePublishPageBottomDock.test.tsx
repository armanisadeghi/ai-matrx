/** @jest-environment jsdom */
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";

import { PAGE_BOTTOM_DOCK_VAR, usePublishPageBottomDock } from "./usePublishPageBottomDock";

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Drawer() {
  const ref = useRef<HTMLElement>(null);
  usePublishPageBottomDock(ref, true);
  return <section ref={ref} />;
}

describe("usePublishPageBottomDock", () => {
  it("publishes the drawer height while mounted and clears it when it goes", () => {
    const rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 200 } as DOMRect);
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Drawer />));
    expect(document.documentElement.style.getPropertyValue(PAGE_BOTTOM_DOCK_VAR)).toBe("208px");
    act(() => root.unmount());
    expect(document.documentElement.style.getPropertyValue(PAGE_BOTTOM_DOCK_VAR)).toBe("");
    rect.mockRestore();
  });
});
