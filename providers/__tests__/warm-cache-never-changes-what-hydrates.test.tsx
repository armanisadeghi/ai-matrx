/**
 * A value restored from the client cache (the active org, the scope tree, a
 * preference) must never change what React HYDRATES.
 *
 * The sync boot restores warm-cache slices after load + idle — or at the D345
 * cap, which fires regardless of a streamed boundary still waiting to hydrate.
 * Whenever the cache lands before some part of the tree hydrates, that part
 * used to read the cached value while its server HTML carried the pre-boot
 * value: the composer's context chip hydrated as "Context: ASW" over the
 * server's "Set context" (dev "1 Issue" badge on /chat/new).
 *
 * StoreProvider hands react-redux the store's pre-boot state as `serverState`,
 * so every useAppSelector hydrates against exactly what the server rendered
 * and switches to the live (cached) value right after hydration.
 */

import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/providers/AdminLaneSync", () => ({ AdminLaneSync: () => null }));
jest.mock("@/lib/sync/components/SyncBootstrap", () => ({ SyncBootstrap: () => null }));
jest.mock("@/lib/sync/identity", () => ({ attachStore: () => {} }));
jest.mock("@/lib/redux/store", () => ({ makeStore: () => null }));
jest.mock("@/styles/themes/themeSlice", () => ({
  resolveThemeMode: () => "light",
  themePolicy: { prePaintDescriptors: [] },
  writeThemeCookie: () => {},
}));
jest.mock("@/lib/sync/engine/applyPrePaint", () => ({ applyPrePaintDescriptors: () => {} }));

import { useSelector } from "react-redux";
import StoreProvider from "@/providers/StoreProvider";

const appContext = createSlice({
  name: "appContext",
  initialState: { organization_name: null as string | null },
  reducers: {
    // What the sync boot's warm-cache restore does for the active org.
    restoredFromCache: (state, action: PayloadAction<string>) => {
      state.organization_name = action.payload;
    },
  },
});

function makeTestStore() {
  const store = configureStore({ reducer: { appContext: appContext.reducer } });
  return Object.assign(store, { _sync: { boot: () => Promise.resolve() } });
}

type TestState = ReturnType<ReturnType<typeof makeTestStore>["getState"]>;

/** Stands in for the composer's context chip: label and text from the cache. */
function ContextChip() {
  const org = useSelector((s: TestState) => s.appContext.organization_name);
  const label = org ? `Context: ${org}` : "Set context";
  return (
    <button type="button" aria-label={label} title={label}>
      {org ?? "Set context"}
    </button>
  );
}

describe("a warm cache never changes what hydrates", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
  });

  it("hydrates the server's value while the cache is warm, then shows the cached value", async () => {
    const factory = jest.fn(makeTestStore);
    const tree = (
      <StoreProvider makeStore={factory as never}>
        <ContextChip />
      </StoreProvider>
    );

    // Server HTML: no active org yet ("Set context").
    container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    expect(container.innerHTML).toContain('aria-label="Set context"');

    // The warm cache lands BEFORE this subtree hydrates (the D345 cap firing
    // while a streamed boundary still waits, or a queued "$~" reveal).
    const store = factory.mock.results[0].value as ReturnType<typeof makeTestStore>;
    store.dispatch(appContext.actions.restoredFromCache("ASW"));

    const recoverable: unknown[] = [];
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: (error) => recoverable.push(error),
        });
      });

      const mismatch = consoleError.mock.calls.filter((args) =>
        /hydrat|did not match|didn't match/i.test(String(args[0])),
      );
      expect(recoverable).toEqual([]);
      expect(mismatch).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }

    // Right after hydration the live cached value shows.
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Context: ASW");
    expect(button?.textContent).toBe("ASW");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
