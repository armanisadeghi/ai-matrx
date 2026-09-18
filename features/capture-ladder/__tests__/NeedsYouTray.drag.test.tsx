import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { NeedsYouTray } from "../NeedsYouTray";
import { useNeedsYou } from "../useNeedsYou";

jest.mock("@/hooks/use-mobile", () => ({
  useIsMobile: jest.fn(),
}));

jest.mock("../NeedsYouList", () => ({
  NeedsYouList: () => <div>Waiting pages</div>,
}));

jest.mock("../useNeedsYou", () => ({
  useNeedsYou: jest.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mockedUseNeedsYou = jest.mocked(useNeedsYou);
const mockedUseIsMobile = jest.mocked(useIsMobile);

describe("NeedsYouTray dragging", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockedUseIsMobile.mockReturnValue(false);
    mockedUseNeedsYou.mockReturnValue({
      state: { kind: "ready", handoffs: [], dropped: 0 },
      handoffs: [],
      count: 1,
      needsDriveCount: 0,
      refresh: jest.fn(),
      liveness: "live",
      livenessSentence: "Live updates are on.",
      droppedSentence: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("moves the entire site-wide tray with the same whole-pill drag gesture as assists", () => {
    act(() => {
      root.render(<NeedsYouTray />);
    });

    const launcher = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("1 page needs your browser"),
    );
    const tray = launcher?.closest<HTMLElement>(".fixed");
    expect(launcher).toBeDefined();
    expect(tray).not.toBeNull();

    act(() => {
      launcher?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 800,
          clientY: 700,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 700,
          clientY: 600,
        }),
      );
    });

    expect(tray?.style.right).toBe("116px");
    expect(tray?.style.bottom).toBe("116px");

    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 700,
          clientY: 600,
        }),
      );
      launcher?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(tray?.style.right).toBe("116px");
    expect(tray?.style.bottom).toBe("116px");
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not expose the desktop drag affordance at phone width", () => {
    mockedUseIsMobile.mockReturnValue(true);

    act(() => {
      root.render(<NeedsYouTray />);
    });

    const launcher = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("1 page needs your browser"),
    );

    expect(launcher).toBeDefined();
    expect(launcher?.classList.contains("touch-none")).toBe(true);
    expect(launcher?.classList.contains("cursor-grab")).toBe(false);
    expect(launcher?.classList.contains("active:cursor-grabbing")).toBe(false);
  });
});
