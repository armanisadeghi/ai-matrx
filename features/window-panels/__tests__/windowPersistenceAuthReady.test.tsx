import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import overlayReducer, {
  closeOverlay,
  openOverlay,
} from "@/lib/redux/slices/overlaySlice";
import windowManagerReducer, {
  registerWindow,
} from "@/lib/redux/slices/windowManagerSlice";
import userAuthReducer, {
  clearUserAuth,
  setAuthReady,
} from "@/lib/redux/slices/userAuthSlice";
import userProfileReducer, {
  setFingerprintId,
} from "@/lib/redux/slices/userProfileSlice";
import type { PersistedWindowWorkspace } from "@/features/window-panels/persistence/windowSessionSerialization";
import type { LocalWindowWorkspaceRead } from "@/features/window-panels/persistence/localWindowSessionStore";
import { windowPersistenceCloseMiddleware } from "@/features/window-panels/persistence/windowPersistenceCloseMiddleware";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getWindowWorkspaceIdMock = jest.fn(() => "workspace-public");
const loadLocalWindowWorkspaceMock = jest.fn(
  async (
    _identity: unknown,
    _workspaceId: string,
  ): Promise<LocalWindowWorkspaceRead> => ({
    workspace: null,
    source: "miss",
  }),
);
const saveLocalWindowWorkspaceMock = jest.fn(
  async (_identity: unknown, _workspace: unknown) => undefined,
);
const renewWindowWorkspaceLeaseMock = jest.fn();
const releaseWindowWorkspaceLeaseMock = jest.fn();

jest.mock(
  "@/features/window-panels/persistence/localWindowSessionStore",
  () => ({
    getWindowWorkspaceId: () => getWindowWorkspaceIdMock(),
    loadLocalWindowWorkspace: (identity: unknown, workspaceId: string) =>
      loadLocalWindowWorkspaceMock(identity, workspaceId),
    saveLocalWindowWorkspace: (identity: unknown, workspace: unknown) =>
      saveLocalWindowWorkspaceMock(identity, workspace),
    renewWindowWorkspaceLease: (workspaceId: string) =>
      renewWindowWorkspaceLeaseMock(workspaceId),
    releaseWindowWorkspaceLease: (workspaceId: string) =>
      releaseWindowWorkspaceLeaseMock(workspaceId),
  }),
);

import { WindowPersistenceManager } from "@/features/window-panels/WindowPersistenceManager";

describe("WindowPersistenceManager auth readiness", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    getWindowWorkspaceIdMock.mockClear();
    loadLocalWindowWorkspaceMock.mockClear();
    saveLocalWindowWorkspaceMock.mockClear();
    renewWindowWorkspaceLeaseMock.mockClear();
    releaseWindowWorkspaceLeaseMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not read a guest workspace before public auth resolves", async () => {
    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        userAuth: userAuthReducer,
        userProfile: userProfileReducer,
      },
    });

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPersistenceManager>
            <div>public content</div>
          </WindowPersistenceManager>
        </Provider>,
      );
      await Promise.resolve();
    });

    expect(getWindowWorkspaceIdMock).not.toHaveBeenCalled();
    expect(loadLocalWindowWorkspaceMock).not.toHaveBeenCalled();

    await act(async () => {
      store.dispatch(setFingerprintId("guest-fingerprint"));
      store.dispatch(setAuthReady(true));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getWindowWorkspaceIdMock).toHaveBeenCalledTimes(1);
    expect(loadLocalWindowWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "guest:guest-fingerprint" }),
      "workspace-public",
    );

    await act(async () => {
      store.dispatch(openOverlay({ overlayId: "messagesWindow" }));
      store.dispatch(openOverlay({ overlayId: "jsonTruncator" }));
      store.dispatch(
        registerWindow({
          id: "public-messages",
          initial: { x: 20, y: 20, width: 500, height: 400 },
          persistence: {
            overlayId: "messagesWindow",
            instanceId: "default",
            data: {},
            sidebarOpen: true,
            sidebarSize: 220,
          },
        }),
      );
      store.dispatch(clearUserAuth());
      await Promise.resolve();
    });

    expect(
      store.getState().overlays.overlays.messagesWindow?.default?.isOpen,
    ).toBe(false);
    expect(
      store.getState().overlays.overlays.jsonTruncator?.default?.isOpen,
    ).toBe(false);
    expect(
      store.getState().windowManager.windows["public-messages"].persistence
        ?.closing,
    ).toBe(true);
  });

  it("does not write or resurrect a window closed while authoritative hydration is pending", async () => {
    let resolveWorkspace!: (workspace: PersistedWindowWorkspace | null) => void;
    const pendingWorkspace = new Promise<PersistedWindowWorkspace | null>(
      (resolve) => {
        resolveWorkspace = resolve;
      },
    );
    loadLocalWindowWorkspaceMock.mockResolvedValueOnce({
      workspace: null,
      source: "timeout" as const,
      pendingWorkspace,
    });

    const store = configureStore({
      reducer: {
        overlays: overlayReducer,
        windowManager: windowManagerReducer,
        userAuth: userAuthReducer,
        userProfile: userProfileReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(windowPersistenceCloseMiddleware),
    });
    store.dispatch(setFingerprintId("guest-fingerprint"));
    store.dispatch(setAuthReady(true));

    await act(async () => {
      root.render(
        <Provider store={store}>
          <WindowPersistenceManager>
            <div>public content</div>
          </WindowPersistenceManager>
        </Provider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      store.dispatch(openOverlay({ overlayId: "browserWorkbenchWindow" }));
      store.dispatch(
        registerWindow({
          id: "browser-workbench-window",
          initial: { x: 100, y: 80, width: 900, height: 620 },
          persistence: {
            overlayId: "browserWorkbenchWindow",
            instanceId: "default",
            data: { tabs: [], activeTabId: null },
            sidebarOpen: true,
            sidebarSize: 220,
          },
        }),
      );
      store.dispatch(closeOverlay({ overlayId: "browserWorkbenchWindow" }));
      await new Promise((resolve) => window.setTimeout(resolve, 275));
    });

    expect(saveLocalWindowWorkspaceMock).not.toHaveBeenCalled();
    expect(
      store.getState().windowManager.windows["browser-workbench-window"]
        .persistence?.closing,
    ).toBe(true);

    const cachedWorkspace: PersistedWindowWorkspace = {
      schemaVersion: 1,
      workspaceId: "workspace-public",
      savedAt: 10,
      sessions: [
        {
          schemaVersion: 1,
          sessionKey: "browserWorkbenchWindow:default",
          overlayId: "browserWorkbenchWindow",
          instanceId: "default",
          windowId: "browser-workbench-window",
          title: "Site workbench",
          state: "windowed",
          windowedRect: { x: 100, y: 80, width: 900, height: 620 },
          traySlot: null,
          zIndex: 1000,
          sidebarOpen: true,
          sidebarSize: 220,
          data: {
            tabs: [
              {
                id: "tab-a",
                label: "Example",
                url: "https://example.com/",
              },
            ],
            activeTabId: "tab-a",
          },
          savedAt: 10,
        },
      ],
    };

    await act(async () => {
      resolveWorkspace(cachedWorkspace);
      await pendingWorkspace;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(
      store.getState().overlays.overlays.browserWorkbenchWindow?.default
        ?.isOpen,
    ).toBe(false);
    expect(
      store.getState().windowManager.pendingRestores[
        "browserWorkbenchWindow:default"
      ],
    ).toBeUndefined();
  });
});
