/**
 * styles/themes/themeSlice.ts — the server-readable `theme` cookie mirror.
 *
 * Two SUTs:
 *   1. `writeThemeCookie(mode)` — POSTs the mode to `/api/set-theme`,
 *      fire-and-forget: a failed write must never become an unhandled rejection.
 *   2. The subscription `providers/StoreProvider.tsx` installs — writes the
 *      cookie exactly when `theme.mode` CHANGES, seeded from the store's initial
 *      state so a REHYDRATE of the value already in effect does not POST.
 *
 * (2) runs through the REAL StoreProvider over the REAL store factory and theme
 * reducer. The previous version exercised a hand-copied replica of the
 * subscription, so no regression in StoreProvider could ever turn it red.
 * `fetch` (the network) is the one double. `SyncBootstrap` is replaced because
 * its post-load persisted boot is the sync engine's own contract and would race
 * these assertions from a timer.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/lib/sync/components/SyncBootstrap", () => ({
  SyncBootstrap: () => null,
}));

import StoreProvider from "@/providers/StoreProvider";
import { makeStore, type AppStore } from "@/lib/redux/store";
import { useAppStore } from "@/lib/redux/hooks";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
import {
  setMode,
  toggleMode,
  writeThemeCookie,
  type ThemeMode,
} from "../themeSlice";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type FetchArgs = Parameters<typeof fetch>;
const originalFetch = globalThis.fetch;

/** Replace the network. Default: a request that never settles (the writer never reads it). */
function stubFetch(
  impl: (...args: FetchArgs) => Promise<Response> = () =>
    new Promise<Response>(() => {}),
) {
  const fetchMock = jest.fn(impl);
  globalThis.fetch = fetchMock;
  return fetchMock;
}

/** The theme values the cookie endpoint received, in order. */
function themeCookieWrites(
  fetchMock: ReturnType<typeof stubFetch>,
): unknown[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/set-theme")
    .map(([, init]) =>
      typeof init?.body === "string" ? JSON.parse(init.body) : null,
    );
}

const unmounts: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (unmounts.length) await unmounts.pop()?.();
  globalThis.fetch = originalFetch;
});

describe("writeThemeCookie", () => {
  it.each<ThemeMode>(["dark", "light"])(
    "POSTs %s as JSON to /api/set-theme",
    (mode) => {
      const fetchMock = stubFetch();

      writeThemeCookie(mode);

      expect(fetchMock.mock.calls).toEqual([
        [
          "/api/set-theme",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `{"theme":"${mode}"}`,
          },
        ],
      ]);
    },
  );

  it("never lets a failed cookie write become an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const fetchMock = stubFetch(() =>
        Promise.reject(new Error("offline")),
      );

      expect(() => writeThemeCookie("dark")).not.toThrow();
      // One timer turn IS the observation window: Node reports an unhandled
      // rejection only after the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

/** Mount the real StoreProvider and hand back the store it provides. */
async function mountStoreProvider(): Promise<AppStore> {
  const holder: { store: AppStore | null } = { store: null };
  function CaptureStore(): null {
    holder.store = useAppStore();
    return null;
  }
  // StoreProvider keeps one browser store per factory reference; a fresh
  // factory gives every test the real initial state.
  const factory = (initialState?: Parameters<typeof makeStore>[0]) =>
    makeStore(initialState);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(StoreProvider, {
        makeStore: factory,
        children: createElement(CaptureStore),
      }),
    );
  });
  unmounts.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const store = holder.store;
  if (!store) throw new Error("StoreProvider did not provide a store");
  return store;
}

function rehydrateTheme(mode: ThemeMode): RehydrateAction {
  return {
    type: REHYDRATE_ACTION_TYPE,
    payload: { sliceName: "theme", state: { mode } },
    meta: { fromRehydrate: true },
  };
}

describe("StoreProvider theme-cookie subscription", () => {
  it("mounts on the real initial dark mode without writing the cookie", async () => {
    const fetchMock = stubFetch();

    const store = await mountStoreProvider();

    expect(store.getState().theme.mode).toBe("dark");
    expect(themeCookieWrites(fetchMock)).toEqual([]);
  });

  it("writes the cookie once when setMode changes the mode", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(setMode("light"));
    });

    expect(themeCookieWrites(fetchMock)).toEqual([{ theme: "light" }]);
  });

  it("writes the cookie on toggleMode in both directions", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(toggleMode());
    });
    await act(async () => {
      store.dispatch(toggleMode());
    });

    expect(themeCookieWrites(fetchMock)).toEqual([
      { theme: "light" },
      { theme: "dark" },
    ]);
  });

  it("does not write when setMode keeps the mode already in effect", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(setMode("dark"));
    });

    expect(themeCookieWrites(fetchMock)).toEqual([]);
  });

  it("does not write when REHYDRATE restores the mode already in effect", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(rehydrateTheme("dark"));
    });

    expect(themeCookieWrites(fetchMock)).toEqual([]);
  });

  it("writes when REHYDRATE brings in a different mode", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(rehydrateTheme("light"));
    });

    expect(themeCookieWrites(fetchMock)).toEqual([{ theme: "light" }]);
  });

  it("writes once per distinct change across a burst of dispatches", async () => {
    const fetchMock = stubFetch();
    const store = await mountStoreProvider();

    await act(async () => {
      store.dispatch(setMode("light"));
      store.dispatch(setMode("light"));
      store.dispatch(toggleMode());
      store.dispatch(setMode("dark"));
    });

    expect(themeCookieWrites(fetchMock)).toEqual([
      { theme: "light" },
      { theme: "dark" },
    ]);
  });
});
