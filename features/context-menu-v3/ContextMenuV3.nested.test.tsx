import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

jest.mock("next/dynamic", () => () => (props: { mode: string; sourceFeature: string }) => {
  const ReactModule = require("react");
  return ReactModule.createElement("div", {
    "data-testid": "alchemy-menu",
    "data-mode": props.mode,
    "data-source": props.sourceFeature,
  });
});
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
    // One menu, the innermost one — the Alchemy engine for the inner surface.
    const menus = [...document.querySelectorAll('[data-testid="alchemy-menu"]')];
    expect(menus.map((m) => [m.getAttribute("data-source"), m.getAttribute("data-mode")])).toEqual([
      ["code-editor", "context"],
    ]);
  });

  it("wraps multiple desktop children without violating the Radix slot contract", () => {
    expect(() => {
      act(() => {
        root.render(
          <NonEditableContextMenu sourceFeature="admin">
            <table data-testid="directory-table">
              <tbody>
                <tr>
                  <td>Shortcut</td>
                </tr>
              </tbody>
            </table>
            <div data-testid="directory-state">Loading shortcuts</div>
          </NonEditableContextMenu>,
        );
      });
    }).not.toThrow();

    expect(host.querySelector('[data-testid="directory-table"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="directory-state"]')).not.toBeNull();
    expect(
      host.querySelector('div[style*="display: contents"]'),
    ).not.toBeNull();
  });
});
