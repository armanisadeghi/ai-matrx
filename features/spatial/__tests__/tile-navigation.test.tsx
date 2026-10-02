jest.mock("@/lib/toast", () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TileNavigationBoundary, leavesBoard } from "../engine/tile-navigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * THE CLASS: a tile renders a feature's real component, and those navigate. A
 * meeting tile's Join sent the whole tab to the meeting room and the board was
 * gone (2026-10-02). From inside a tile, leaving the page opens a new tab.
 */
const at = { href: "http://app.test/board#cam=0,0,1", origin: "http://app.test", pathname: "/board" };

describe("leavesBoard — what leaves the board", () => {
  it("another page, another site: leaves; the board's own address: stays", () => {
    expect(leavesBoard("/meet/abc", at)?.pathname).toBe("/meet/abc");
    expect(leavesBoard("/meetings/1?tab=details", at)?.pathname).toBe("/meetings/1");
    expect(leavesBoard("https://example.com/x", at)?.origin).toBe("https://example.com");
    expect(leavesBoard("/board?view=grid", at)).toBeNull();
    expect(leavesBoard("#cam=1,2,3", at)).toBeNull();
    expect(leavesBoard("mailto:a@b.co", at)).toBeNull();
  });
});

describe("TileNavigationBoundary — the router a tile's content sees", () => {
  it("a push or replace to another page opens a new tab and never navigates the board", () => {
    const push = jest.fn();
    const replace = jest.fn();
    const router = { push, replace, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() } as unknown as AppRouterInstance;
    const open = jest.spyOn(window, "open").mockReturnValue({ opener: window } as unknown as Window);
    let seen: AppRouterInstance | null = null;
    function Content() {
      seen = useContext(AppRouterContext);
      return null;
    }
    const el = document.createElement("div");
    act(() =>
      createRoot(el).render(
        <AppRouterContext.Provider value={router}>
          <TileNavigationBoundary>
            <Content />
          </TileNavigationBoundary>
        </AppRouterContext.Provider>,
      ),
    );
    seen!.push("/meetings/m1?tab=details");
    seen!.replace("/meet/abc");
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(2);
    expect(String(open.mock.calls[0][0])).toContain("/meetings/m1?tab=details");
    // The board's own address is the content's to change (query state).
    seen!.replace(`${window.location.pathname}?view=grid`);
    expect(replace).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });
});
