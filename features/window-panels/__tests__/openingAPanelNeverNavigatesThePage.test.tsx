/**
 * LANE PANEL-REMOUNT (2026-09-24) — opening or closing a window panel must
 * never make the page that opened it do any work.
 *
 * The measured defect: on /data-v2/[tableId], pressing a row's agent button
 * opened the agent in a flexible panel, the panel published its address
 * (`?panels=agent:<id>:m-flexible-panel`), and `UrlPanelManager` wrote that
 * address with `router.replace`. In the App Router `router.replace` is a
 * NAVIGATION: it fetched a fresh RSC payload for the route (~1 s on the shared
 * preview) and, when it committed, the grid subtree was thrown away and
 * mounted again — `table_kernel_id`, `applicable_fields`, `my_levels`,
 * `table_decorations`, `table_home` all re-read, and the row DOM nodes the
 * person was looking at were replaced. Headless census, before the fix:
 * one `?_rsc=` request for the panels URL, then eleven grid RPCs, and the
 * first grid row's node was no longer in the document.
 *
 * A panel address is bookkeeping about the window layer, not a new page. The
 * primitive now writes it with `history.replaceState` (Next's patched history
 * keeps `useSearchParams` / `usePathname` in step without a server round trip),
 * so every page that mounts panels inherits "zero page work".
 *
 * RED on the previous bytes (run 2026-09-24): all three cases fail — the
 * address only ever changed THROUGH `router.replace`, so with the router held
 * to a recorder the panel never reached the address (`Expected:
 * "agent:run-1:m-flexible-panel" Received: null`) and `navigations` held one
 * `replace` per open or close.
 */
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import urlSyncReducer, {
  registerSyncEntry,
  unregisterSyncEntry,
} from "@/lib/redux/slices/urlSyncSlice";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Every call here is a server navigation of the route — the thing that remounted the grid. */
const navigations: string[] = [];

jest.mock("next/navigation", () => {
  const router = {
    replace: (url: string) => navigations.push(`replace ${url}`),
    push: (url: string) => navigations.push(`push ${url}`),
    refresh: () => navigations.push("refresh"),
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
  };
  return {
    useRouter: () => router,
    // The address bar is the one truth, exactly as Next's patched history makes it.
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(window.location.search),
  };
});

jest.mock("@/features/window-panels/url-sync/initUrlHydration", () => ({
  initUrlHydration: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  toastErrorAlreadyCaptured: () => undefined,
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: () => undefined,
}));

import { UrlPanelManager } from "@/features/window-panels/url-sync/UrlPanelManager";

/**
 * Stands in for a page like /data-v2/[tableId]: it reads the address (as the
 * real page does for `?view=`, `?record=`, `?filter=`) and loads its data once
 * per mount.
 */
let pageMounts = 0;
let pageDataReads = 0;
function TablePageProbe() {
  useEffect(() => {
    pageMounts += 1;
    pageDataReads += 1;
  }, []);
  return <div data-testid="grid">grid</div>;
}

function panelsParam(): string | null {
  return new URLSearchParams(window.location.search).get("panels");
}

describe("opening a window panel never navigates the page that opened it", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;
  const makeStore = () =>
    configureStore({ reducer: { urlSync: urlSyncReducer } });

  beforeEach(() => {
    navigations.length = 0;
    pageMounts = 0;
    pageDataReads = 0;
    window.history.replaceState(null, "", "/data-v2/table-1?view=grid");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store = makeStore();
    act(() => {
      root.render(
        <Provider store={store}>
          <UrlPanelManager />
          <TablePageProbe />
        </Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("writes the agent panel's address with zero navigations and zero page reloads", () => {
    const gridNode = container.querySelector("[data-testid=grid]");

    act(() => {
      store.dispatch(
        registerSyncEntry({
          typeKey: "agent",
          instanceId: "run-1",
          args: { m: "flexible-panel" },
        }),
      );
    });

    // The address carries the panel, and keeps what the page put there.
    expect(panelsParam()).toBe("agent:run-1:m-flexible-panel");
    expect(new URLSearchParams(window.location.search).get("view")).toBe("grid");
    expect(window.location.pathname).toBe("/data-v2/table-1");

    // …and the page did nothing at all.
    expect(navigations).toHaveLength(0);
    expect(pageMounts).toBe(1);
    expect(pageDataReads).toBe(1);
    expect(container.querySelector("[data-testid=grid]")).toBe(gridNode);
  });

  it("closing the panel removes its address with zero navigations too", () => {
    act(() => {
      store.dispatch(registerSyncEntry({ typeKey: "notes", instanceId: "default" }));
    });
    expect(panelsParam()).toBe("notes:default");

    act(() => {
      store.dispatch(unregisterSyncEntry({ typeKey: "notes", instanceId: "default" }));
    });

    expect(panelsParam()).toBeNull();
    expect(window.location.search).toBe("?view=grid");
    expect(navigations).toHaveLength(0);
    expect(pageMounts).toBe(1);
  });

  it("keeps a query the page wrote after the manager last rendered", () => {
    act(() => {
      store.dispatch(registerSyncEntry({ typeKey: "notes", instanceId: "default" }));
    });
    // The page moves to the board through its own write, between panel events.
    window.history.replaceState(
      null,
      "",
      `/data-v2/table-1?view=kanban&panels=${encodeURIComponent("notes:default")}`,
    );

    act(() => {
      store.dispatch(
        registerSyncEntry({ typeKey: "agent", instanceId: "run-2", args: { m: "flexible-panel" } }),
      );
    });

    expect(new URLSearchParams(window.location.search).get("view")).toBe("kanban");
    expect(panelsParam()).toBe("notes:default,agent:run-2:m-flexible-panel");
    expect(navigations).toHaveLength(0);
  });
});
