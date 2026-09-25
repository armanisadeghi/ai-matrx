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
 * RED on the previous bytes: (1) and (2) both fail — the address is rewritten
 * with the token stripped as soon as the grace timer fires.
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

// The manager writes the address through the (Next-patched) history API and
// never through the router (lane PANEL-REMOUNT) — so the address bar is the
// one truth these mocks read, and a router call is a defect.
const mockReplace = jest.fn();
const setUrl = (url: string) => window.history.replaceState(null, "", url);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
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
  return new URLSearchParams(window.location.search).get("panels");
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
    expect(mockReplace).not.toHaveBeenCalled();
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
    setUrl("/tasks?panels=brand_channel:brand-1");

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
    setUrl("/tasks?panels=site_tracking:site-9");

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
    setUrl("/tasks?panels=not_a_window:xyz");

    render();

    act(() => {
      jest.advanceTimersByTime(OLD_GRACE_MS + 1000);
    });

    expect(panelsParam()).toBe("not_a_window:xyz");
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain("not_a_window");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  /**
   * V-29 NEW-1 — AN ALIAS IS SETTLED BY THE WINDOW IT OPENS.
   *
   * `?panels=files:<id>` is a legacy alias: its hydrator opens
   * `cloudFilesWindow`, which registers its address under the CANONICAL key
   * `cloud_files`. Before this, the manager compared raw token keys only, so
   * `files` never left the unresolved set: the address was rewritten to carry
   * BOTH tokens for the one window, and at the deadline the person was told on
   * screen — in a red-tier durable incident — that a window plainly on their
   * screen could not be opened. Law 4 inverted: a false alarm is a lie too.
   *
   * RED on the previous bytes:
   *   ● an aliased deep link is settled by the window its alias opens
   *     expect(received).toBe(expected)
   *     Expected: "cloud_files:cloudFilesWindow"
   *     Received: "cloud_files:cloudFilesWindow,files:root"
   *     …and then: expect(jest.fn()).not.toHaveBeenCalled()
   *     Received has 1 call: "This link names a window this build could not
   *     open: files. …"  (toast), plus one captureError.
   */
  it("settles an aliased deep link with the window its alias opens, once, and says nothing", () => {
    registerPanelHydrator("files", () => undefined);
    setUrl("/tasks?panels=files:root");

    render();

    // The window opens under its own canonical key — exactly what the real
    // CloudFilesWindow does (`urlSync.key = "cloud_files"`).
    act(() => {
      store.dispatch(
        registerSyncEntry({
          typeKey: "cloud_files",
          instanceId: "cloudFilesWindow",
        }),
      );
    });

    // ONE token for ONE window, and it is the canonical one.
    expect(panelsParam()).toBe("cloud_files:cloudFilesWindow");

    // Long past the notice deadline: a window that is on screen is never
    // announced as unopenable.
    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(panelsParam()).toBe("cloud_files:cloudFilesWindow");
    expect(toastMock).not.toHaveBeenCalled();
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("still keeps and announces an aliased token whose window never registers, naming what was pasted", () => {
    registerPanelHydrator("files", () => undefined);
    setUrl("/tasks?panels=files:root");

    render();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    // F-127's contract is untouched: the address survives the failure…
    expect(panelsParam()).toBe("files:root");
    // …and the notice names the key the person actually pasted, not the
    // canonical key they have never seen.
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain("files");
    expect(toastMock.mock.calls[0][0]).not.toContain("cloud_files");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  /**
   * 🚨 CANONICALISING A TOKEN REWRITES ITS KEY AND NOTHING ELSE (V-30 NEW-4).
   * `?panels=files:root` settled as `cloud_files:cloudFilesWindow` — the key
   * corrected AND the instance id the person pasted thrown away for the
   * window's own singleton id. The alias is a 1:1 key substitution, so while
   * nobody has published anything the address is `cloud_files:root`: the
   * canonical key, the pasted instance id.
   */
  it("canonicalises an aliased token's KEY and keeps the pasted instance id", () => {
    registerPanelHydrator("files", () => undefined);
    registerPanelHydrator("cloud_files", () => undefined);
    setUrl("/tasks?panels=files:root");

    render();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(panelsParam()).toBe("cloud_files:root");
    // The sentence still names the key the person actually pasted.
    expect(toastMock.mock.calls[0][0]).toContain("files");
    expect(toastMock.mock.calls[0][0]).not.toContain("cloud_files");
  });

  it("lets the window that publishes a different instance id win", () => {
    registerPanelHydrator("files", () => undefined);
    registerPanelHydrator("cloud_files", () => undefined);
    setUrl("/tasks?panels=files:root");

    render();

    act(() => {
      store.dispatch(
        registerSyncEntry({
          typeKey: "cloud_files",
          instanceId: "cloudFilesWindow",
        }),
      );
    });

    // ONE token for ONE window, and it is the window's own address.
    expect(panelsParam()).toBe("cloud_files:cloudFilesWindow");
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  /**
   * 🚨 TWO TOKENS THAT CANONICALISE TOGETHER MUST BOTH SURVIVE (V-30 NEW-5).
   * The pending record was stored under the canonical key alone, so a link
   * carrying BOTH `files:a` and `cloud_files:b` kept only the second: the
   * first pasted token was forgotten with no warning, and the notice named one
   * key instead of two.
   */
  it("keeps BOTH tokens when two of them canonicalise to the same key", () => {
    registerPanelHydrator("files", () => undefined);
    registerPanelHydrator("cloud_files", () => undefined);
    setUrl("/tasks?panels=files:a,cloud_files:b");

    render();

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(panelsParam()).toBe("cloud_files:a,cloud_files:b");
    // …and the person is told about both keys they pasted, not one.
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toContain("files, cloud_files");
  });

  it("still removes a token when its window actually closes", () => {
    registerPanelHydrator("notes", () => undefined);
    setUrl("/tasks?panels=notes:default");

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
