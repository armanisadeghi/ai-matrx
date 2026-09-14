import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@ai-matrx/design-system";

import { TableToolbarAction } from "./TableToolbarAction";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TableToolbarAction production TapTarget integration", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps a four-digit page label centered inside the real TapTarget pill", () => {
    act(() => {
      root.render(
        <TooltipProvider>
          <TableToolbarAction ariaLabel="Page 1000" active onClick={() => undefined}>
            <span>1000</span>
          </TableToolbarAction>
        </TooltipProvider>,
      );
    });

    const button = host.querySelector<HTMLButtonElement>("button[aria-label='Page 1000']");
    const pill = button?.querySelector<HTMLElement>(".matrx-tap-pill");
    const label = pill?.querySelector<HTMLElement>("span");
    expect(pill).not.toBeNull();
    expect(label?.textContent).toBe("1000");
    expect(label?.className).toContain("matrx-tap-icon");
    expect(label?.className).toContain("!w-auto");
    expect(label?.className).toContain("!h-auto");
    expect(label?.className).toContain("max-w-7");
    expect(label?.className).toContain("overflow-hidden");
    expect(label?.className).toContain("text-[11px]");
    expect(label?.className).toContain("tabular-nums");
  });
});
