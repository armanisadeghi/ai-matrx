import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

jest.mock("next/dynamic", () => () => () => null);
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
jest.mock("@/features/agents/hooks/useWidgetHandle", () => ({
  useOptionalWidgetHandle: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function touchEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
  });
  return event;
}

describe("ContextMenuV3 mobile long-press trigger", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("opens the mobile drawer after a stationary 480 ms touch hold", () => {
    act(() => {
      root.render(
        <NonEditableContextMenu
          sourceFeature="system"
          surfaceName="matrx-user/settings"
        >
          <button type="button" data-testid="settings-surface">
            Settings integrations
          </button>
        </NonEditableContextMenu>,
      );
    });

    const trigger = host.querySelector<HTMLElement>(
      '[data-testid="settings-surface"]',
    );
    expect(trigger).not.toBeNull();
    if (!trigger) throw new Error("mobile context-menu trigger did not render");

    act(() => {
      trigger.dispatchEvent(touchEvent("touchstart", 120, 240));
      jest.advanceTimersByTime(479);
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
