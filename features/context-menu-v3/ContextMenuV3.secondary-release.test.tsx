import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

const mockSelect = jest.fn();

jest.mock("next/dynamic", () => () => {
  const ReactModule = require("react");
  const {
    ContextMenuItem,
  } = require("@/components/ui/context-menu/context-menu");
  return function TestMenuContent() {
    return ReactModule.createElement(
      ContextMenuItem,
      { onSelect: mockSelect },
      "Insert reference…",
    );
  };
});

jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("ContextMenuV3 secondary-button release", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockSelect.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function openMenu(): HTMLElement {
    act(() => {
      root.render(
        <NonEditableContextMenu sourceFeature="code-editor">
          <div data-testid="trigger">Editor content</div>
        </NonEditableContextMenu>,
      );
    });
    const trigger = host.querySelector<HTMLElement>('[data-testid="trigger"]');
    if (!trigger) throw new Error("context-menu trigger did not render");
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("contextmenu", {
          button: 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    const item = document.querySelector<HTMLElement>('[role="menuitem"]');
    if (!item) throw new Error("context-menu item did not render");
    return item;
  }

  it("does not select the command under the opening right-button release", () => {
    const item = openMenu();

    act(() => {
      item.dispatchEvent(
        new MouseEvent("pointerup", {
          button: 2,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("keeps primary-button command selection intact", () => {
    const item = openMenu();

    act(() => {
      item.dispatchEvent(
        new MouseEvent("pointerdown", { button: 0, bubbles: true }),
      );
      item.dispatchEvent(
        new MouseEvent("pointerup", { button: 0, bubbles: true }),
      );
      item.dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true }));
    });

    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps keyboard Enter command selection intact", () => {
    const item = openMenu();

    act(() => {
      item.focus();
      item.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
