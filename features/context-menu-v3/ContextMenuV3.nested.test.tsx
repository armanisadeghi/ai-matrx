import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContextMenuV3 nested desktop triggers", () => {
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

  it("opens the innermost menu and leaves the outer menu closed", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="files">
          <div data-testid="outer-trigger">
            <NonEditableContextMenu sourceFeature="code-editor">
              <button type="button" data-testid="inner-trigger">
                Inner row
              </button>
            </NonEditableContextMenu>
          </div>
        </NonEditableContextMenu>,
      );
    });

    const inner = host.querySelector<HTMLElement>(
      '[data-testid="inner-trigger"]',
    );
    const outer = host.querySelector<HTMLElement>(
      '[data-testid="outer-trigger"]',
    );
    expect(inner).not.toBeNull();
    expect(outer).not.toBeNull();
    if (!inner || !outer) throw new Error("nested triggers did not render");

    act(() => {
      inner.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });

    expect(inner.getAttribute("data-state")).toBe("open");
    expect(outer.getAttribute("data-state")).toBe("closed");
  });
});
