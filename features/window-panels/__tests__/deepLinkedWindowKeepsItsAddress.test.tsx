/**
 * V-28 NEW-5 — a `?panels=` deep link must never erase itself.
 *
 * The measured defect: `?panels=brand_channel:<brandId>` opened nothing in
 * four of eight fresh loads, and every one of those loads ALSO deleted the
 * token from the address bar without a word. The cause was not the window: it
 * was a 5000 ms wall clock in `UrlPanelManager` racing a lazily-compiled
 * chunk, and treating its own expiry as proof the token was junk.
 *
 * These are the three facts that must hold for every addressed window:
 *  1. a window that registers LATE (after the old deadline) still ends up with
 *     its address in the URL — the manager waits on the registration signal,
 *     not on a clock;
 *  2. a window that never registers keeps the token in the URL anyway and the
 *     person is TOLD (law 4), with a diagnostic captured;
 *  3. a token with no hydrator at all is likewise kept and announced.
 *
 * RED on the previous bytes: (1) and (2) both fail — `router.replace` is
 * called with the token stripped as soon as the grace timer fires.
 */
import React from "react";
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

let mockUrl = "/tasks";
const mockReplace = jest.fn((url: string) => {
  mockUrl = url;
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUrl.split("?")[0],
  useSearchParams: () => new URLSearchParams(mockUrl.split("?")[1] ?? ""),
}));

// The real module pulls half the app in and registers ~40 hydrators; this
// suite registers exactly the hydrators it is talking about.
const initUrlHydrationMock = jest.fn();
jest.mock("@/features/window-panels/url-sync/initUrlHydration", () => ({
  initUrlHydration: () => initUrlHydrationMock(),
}));

const toastMock = jest.fn();
jest.mock("@/lib/toast", () => ({
  toastErrorAlreadyCaptured: (message: string, options?: unknown) =>
    toastMock(message, options),
}));

const captureErrorMock = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: unknown) => captureErrorMock(input),
}));

import { UrlPanelManager } from "@/features/window-panels/url-sync/UrlPanelManager";
import { registerPanelHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";

/** The old, now-deleted wall clock. Nothing may happen to the URL at this mark. */
const OLD_GRACE_MS = 5000;

function panelsParam(): string | null {
  return new URLSearchParams(mockUrl.split("?")[1] ?? "").get("panels");
}

describe("a deep-linked window keeps its address", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: ReturnType<typeof makeStore>;

  const makeStore = () =>
    configureStore({ reducer: { urlSync: urlSyncReducer } });

  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    toastMock.mockClear();
    captureErrorMock.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store = makeStore();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const render = () =>
    act(() => {
      root.render(
        <Provider store={store}>
          <UrlPanelManager />
        </Provider>,
      );
    });

  it("waits for a late registration instead of a clock, and the token survives the wait", () => {
    registerPanelHydrator("brand_channel", () => undefined);
    mockUrl = "/tasks?panels=brand_channel:brand-1";

    render();

    // Past the deadline the old bytes used to act on…
    act(() => {
      jest.advanceTimersByTime(OLD_GRACE_MS + 1000);
    });
    expect(panelsParam()).toBe("brand_channel:brand-1");
    expect(mockReplace).not.toHaveBeenCalled();

    // …and the window's chunk finally lands, long after it.
    act(() => {
      store.dispatch(
        registerSyncEntry({ typeKey: "brand_channel", instanceId: "brand-1" }),
      );
    });

    expect(panelsParam()).toBe("brand_channel:brand-1");
    // Nothing was announced: the link worked, it was only slow.
    expect(toastMock).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("keeps the address and says so when the window never registers", () => {
    registerPanelHydrator("site_tracking", () => undefined);
    mockUrl = "/tasks?panels=site_tracking:site-9";

    render();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    // The one thing the page must never do: throw away what was pasted.
    expect(panelsParam()).toBe("site_tracking:site-9");

    expect(toastMock).toHaveBeenCalledTimes(1);
    const notice = toastMock.mock.calls[0][0] as string;
    expect(notice).toContain("site_tracking");
    expect(notice).toContain("could not open");
    expect(notice).toContain("unchanged in your address bar");

    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0][0]).toMatchObject({
      source: "url-panel-unopened",
      relation: "?panels=site_tracking",
    });
  });

  it("keeps the address and says so when no hydrator owns the token", () => {
    mockUrl = "/tasks?panels=not_a_window:xyz";

    render();

    act(() => {
      jest.advanceTimersByTime(OLD_GRACE_MS + 1000);
    });

    expect(panelsParam()).toBe("not_a_window:xyz");
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain("not_a_window");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("still removes a token when its window actually closes", () => {
    registerPanelHydrator("notes", () => undefined);
    mockUrl = "/tasks?panels=notes:default";

    render();

    act(() => {
      store.dispatch(
        registerSyncEntry({ typeKey: "notes", instanceId: "default" }),
      );
    });
    expect(panelsParam()).toBe("notes:default");

    act(() => {
      store.dispatch(
        unregisterSyncEntry({ typeKey: "notes", instanceId: "default" }),
      );
    });

    expect(panelsParam()).toBeNull();
  });
});
