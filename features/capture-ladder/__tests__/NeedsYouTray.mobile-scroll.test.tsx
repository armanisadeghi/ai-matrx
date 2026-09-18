import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NeedsYouTray } from "../NeedsYouTray";
import { useNeedsYou } from "../useNeedsYou";
import { useDockDrag } from "@/features/assists/components/useDockDrag";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => true,
}));

jest.mock("../NeedsYouList", () => ({
  NeedsYouList: () => <div>Waiting pages</div>,
}));

jest.mock("../useNeedsYou", () => ({
  useNeedsYou: jest.fn(),
}));

jest.mock("@/features/assists/components/useDockDrag", () => ({
  useDockDrag: jest.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockedUseNeedsYou = jest.mocked(useNeedsYou);
const mockedUseDockDrag = jest.mocked(useDockDrag);

describe("NeedsYouTray mobile scrolling", () => {
  let container: HTMLDivElement;
  let pageScroller: HTMLDivElement;
  let root: Root;
  const onPointerDown = jest.fn();

  beforeEach(() => {
    container = document.createElement("div");
    pageScroller = document.createElement("div");
    pageScroller.style.overflowY = "auto";
    Object.defineProperty(pageScroller, "clientHeight", { value: 600 });
    Object.defineProperty(pageScroller, "scrollHeight", { value: 1600 });
    document.body.appendChild(pageScroller);
    document.body.appendChild(container);
    root = createRoot(container);
    mockedUseNeedsYou.mockReturnValue({
      state: { kind: "ready", handoffs: [], dropped: 0 },
      handoffs: [],
      count: 1,
      needsDriveCount: 0,
      refresh: jest.fn(),
      liveness: "live",
      livenessSentence: null,
      droppedSentence: null,
    });
    mockedUseDockDrag.mockReturnValue({
      offset: { right: 16, bottom: 16 },
      dragging: false,
      onPointerDown,
      suppressClickRef: { current: false },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    pageScroller.remove();
    Reflect.deleteProperty(document, "elementsFromPoint");
    jest.clearAllMocks();
  });

  it("scrolls the page behind a swipe without firing the tray click", () => {
    act(() => {
      root.render(<NeedsYouTray />);
    });

    const launcher = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("1 page needs your browser"),
    );
    expect(launcher).toBeDefined();
    expect(launcher?.classList.contains("touch-none")).toBe(true);

    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [launcher, pageScroller].filter(Boolean),
    });

    const touchEvent = (type: string, clientY?: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value:
          clientY === undefined ? [] : [{ clientX: 300, clientY }],
      });
      return event;
    };

    act(() => {
      launcher?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 300,
          clientY: 700,
        }),
      );
      launcher?.dispatchEvent(touchEvent("touchstart", 700));
      launcher?.dispatchEvent(touchEvent("touchmove", 600));
      launcher?.dispatchEvent(touchEvent("touchend"));
      launcher?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(pageScroller.scrollTop).toBe(100);
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
  });
});
