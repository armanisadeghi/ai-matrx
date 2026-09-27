import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";
import { EditableContextMenu } from "./EditableContextMenu";

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

/**
 * Every window body is a read-only menu (WindowSelectionSurface). A read-only
 * menu yields a live text field to the browser's native menu — but it must
 * never swallow the field's OWN editable menu nested inside it (the Feedback
 * window's description box had no menu at all, 2026-09-27).
 */
describe("ContextMenuV3 — a text field inside a read-only surface", () => {
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

  const rightClick = (el: HTMLElement) => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      el.dispatchEvent(event);
    });
    return event;
  };
  const menus = () =>
    [...document.querySelectorAll('[data-testid="alchemy-menu"]')].map((m) =>
      m.getAttribute("data-source"),
    );

  it("opens the field's own editable menu nested inside a read-only window surface", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="system">
          <div>
            <EditableContextMenu sourceFeature="notes" contentSource={{ type: "raw" }}>
              <textarea data-testid="field" defaultValue="hello" />
            </EditableContextMenu>
          </div>
        </NonEditableContextMenu>,
      );
    });
    const field = host.querySelector<HTMLElement>('[data-testid="field"]')!;
    const event = rightClick(field);
    expect(menus()).toEqual(["notes"]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves a bare field inside a read-only surface to the native menu", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="system">
          <div>
            <textarea data-testid="field" defaultValue="hello" />
          </div>
        </NonEditableContextMenu>,
      );
    });
    const field = host.querySelector<HTMLElement>('[data-testid="field"]')!;
    const event = rightClick(field);
    expect(menus()).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("an editable menu OUTSIDE the read-only surface still yields the inner bare field", () => {
    act(() => {
      root.render(
        <EditableContextMenu sourceFeature="notes" contentSource={{ type: "raw" }}>
          <div>
            <NonEditableContextMenu sourceFeature="system">
              <div>
                <textarea data-testid="field" defaultValue="hello" />
              </div>
            </NonEditableContextMenu>
          </div>
        </EditableContextMenu>,
      );
    });
    const field = host.querySelector<HTMLElement>('[data-testid="field"]')!;
    const event = rightClick(field);
    expect(menus()).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});
