/**
 * A VALUE THE BROWSER RESTORES BEFORE A BOUNDARY HYDRATES NEVER CHANGES WHAT HYDRATES — inside
 * <ChatProvider> too.
 *
 * The app's StoreProvider hands react-redux the store's pre-boot state as `serverState`, so every
 * `useSelector` hydrates against the server HTML. <ChatProvider> mounts the SAME store on its own
 * `ChatStoreContext` through a second <Provider> — which had no `serverState`, so every chat
 * component (`useAppSelector` from the package) hydrated against the LIVE store. When the active
 * organization was restored from storage before the composer's Suspense boundary hydrated, the
 * context chip counted an Organization row the server never had: a hydration error on every
 * /chat/new reload (patched for that one chip in c9f3ebded1).
 */

import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../store/chat-host-sync", () => ({ useChatHostSync: () => undefined }));

import { ChatProvider } from "../react";
import { _resetChatHostForTests } from "../index";
import { useAppSelector } from "../../store/hooks";
import { createFakeDb } from "./fake-db";

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

function makeStore() {
  return configureStore({ reducer: { appContext: appContext.reducer } });
}

/** A chat component reading the active org through the package's own hook. */
function OrgRow() {
  const org = useAppSelector(
    (s) => (s as unknown as { appContext: { organization_name: string | null } }).appContext.organization_name,
  );
  return <span data-org-row>{org ? `Organization: ${org}` : "No organization"}</span>;
}

afterEach(() => _resetChatHostForTests());

describe("<ChatProvider> hydrates what the server rendered", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
  });

  it("reads the host store's server state while hydrating, then the restored value", async () => {
    const { db } = createFakeDb();
    const host = { db };
    const serverStore = makeStore();
    const clientStore = makeStore();
    // StoreProvider's `hydrationSnapshots`: the client store's state before any restore.
    const snapshot = clientStore.getState();
    const tree = (store: ReturnType<typeof makeStore>, serverState?: unknown) => (
      <Provider store={store} serverState={serverState as never}>
        <ChatProvider host={host} store={store}>
          <OrgRow />
        </ChatProvider>
      </Provider>
    );

    container = document.createElement("div");
    container.innerHTML = renderToString(tree(serverStore));
    document.body.appendChild(container);
    expect(container.textContent).toBe("No organization");

    // The org is restored from storage before this subtree hydrates.
    clientStore.dispatch(appContext.actions.restoredFromCache("ASW"));

    const recoverable: unknown[] = [];
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await act(async () => {
        root = hydrateRoot(container!, tree(clientStore, snapshot), {
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
      consoleInfo.mockRestore();
    }
    expect(container.textContent).toBe("Organization: ASW");
  });
});
