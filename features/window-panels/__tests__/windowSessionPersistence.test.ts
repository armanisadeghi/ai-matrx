import reducer, {
  WINDOW_SESSION_SCHEMA_VERSION,
  confirmWindowRestored,
  hydrateWindowSessions,
  markWindowClosing,
  minimizeWindow,
  registerWindow,
  restoreWindow,
  restoreAll,
  moveTraySlot,
  recomputeTrayPositions,
  unregisterWindow,
  updateWindowPersistence,
  windowSessionKey,
  type HydratedWindowSession,
  type WindowManagerState,
} from "@/lib/redux/slices/windowManagerSlice";
import {
  hydrateWindowWorkspace,
  sanitizeWindowSessionData,
  serializeWindowWorkspace,
  WINDOW_WORKSPACE_SCHEMA_VERSION,
} from "@/features/window-panels/persistence/windowSessionSerialization";
import { traySlotRect } from "@/features/window-panels/constants/tray";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

const VIEWPORT = { width: 1280, height: 800 };
const FULL_RECT = { x: 120, y: 80, width: 700, height: 520 };
const RENDER_RECT = { x: 900, y: 700, width: 240, height: 74 };

function fresh(): WindowManagerState {
  return reducer(undefined, { type: "@@INIT" });
}

function restoredSession(
  overrides: Partial<HydratedWindowSession> = {},
): HydratedWindowSession {
  const overlayId = overrides.overlayId ?? "messagesWindow";
  const instanceId = overrides.instanceId ?? "default";
  return {
    schemaVersion: WINDOW_SESSION_SCHEMA_VERSION,
    sessionKey: windowSessionKey(overlayId, instanceId),
    overlayId,
    instanceId,
    windowId: "messages-window",
    title: "Messages",
    state: "minimized",
    windowedRect: FULL_RECT,
    renderRect: RENDER_RECT,
    traySlot: 0,
    zIndex: 1004,
    sidebarOpen: false,
    sidebarSize: 276,
    data: { conversationId: "conversation-1" },
    savedAt: 42,
    ...overrides,
  };
}

function preservation(
  overlayId: OverlayId = "messagesWindow",
  instanceId = "default",
) {
  return {
    overlayId,
    instanceId,
    data: {},
    sidebarOpen: true,
    sidebarSize: null,
  };
}

function hydrateAction(sessions: HydratedWindowSession[]) {
  return hydrateWindowSessions({
    sessions,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
  });
}

describe("window preservation reducer", () => {
  it("atomically consumes staged geometry and semantic state at registration", () => {
    const session = restoredSession();
    let state = reducer(fresh(), hydrateAction([session]));
    state = reducer(
      state,
      registerWindow({
        id: "runtime-id-that-is-not-the-slug",
        title: "Current title",
        initial: { x: 0, y: 0, width: 320, height: 400 },
        persistence: preservation(),
      }),
    );

    const entry = state.windows["runtime-id-that-is-not-the-slug"];
    expect(entry.state).toBe("minimized");
    expect(entry.windowed).toEqual(
      traySlotRect(0, VIEWPORT.width, VIEWPORT.height),
    );
    expect(entry.preMinimizedRect).toEqual(FULL_RECT);
    expect(entry.traySlot).toBe(0);
    expect(entry.persistence?.data).toEqual({
      conversationId: "conversation-1",
    });
    expect(entry.persistence?.sidebarOpen).toBe(false);
    expect(entry.persistence?.sidebarSize).toBe(276);
  });

  it("keeps a pending restore through a StrictMode-style first cleanup", () => {
    const session = restoredSession();
    let state = reducer(fresh(), hydrateAction([session]));
    state = reducer(
      state,
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: preservation(),
      }),
    );
    state = reducer(state, unregisterWindow("messages-window"));
    expect(state.pendingRestores[session.sessionKey]).toBeDefined();
    state = reducer(
      state,
      registerWindow({
        id: "messages-window",
        initial: { x: 0, y: 0, width: 320, height: 400 },
        persistence: preservation(),
        viewport: VIEWPORT,
      }),
    );
    expect(state.windows["messages-window"].preMinimizedRect).toEqual(
      FULL_RECT,
    );

    state = reducer(state, confirmWindowRestored(session.sessionKey));
    expect(state.pendingRestores[session.sessionKey]).toBeUndefined();
  });

  it("lets a live manual or URL-opened instance beat late hydration", () => {
    let state = reducer(
      fresh(),
      registerWindow({
        id: "manual-window",
        initial: FULL_RECT,
        persistence: {
          ...preservation(),
          data: { conversationId: "current" },
        },
      }),
    );
    state = reducer(state, hydrateAction([restoredSession()]));
    expect(state.pendingRestores).toEqual({});
    expect(state.windows["manual-window"].persistence?.data).toEqual({
      conversationId: "current",
    });
  });

  it("uses overlayId plus instanceId as the multi-instance identity", () => {
    const one = restoredSession({
      overlayId: "singleMessageWindow",
      instanceId: "one",
    });
    const two = restoredSession({
      overlayId: "singleMessageWindow",
      instanceId: "two",
      data: { conversationId: "conversation-2" },
    });
    const state = reducer(fresh(), hydrateAction([one, two]));
    expect(Object.keys(state.pendingRestores).sort()).toEqual([
      "singleMessageWindow:one",
      "singleMessageWindow:two",
    ]);
  });

  it("reserves pending tray and z slots across lazy registration", () => {
    const pending = restoredSession();
    let state = reducer(fresh(), hydrateAction([pending]));
    state = reducer(state, registerWindow({ id: "fresh", initial: FULL_RECT }));
    state = reducer(
      state,
      minimizeWindow({
        id: "fresh",
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
      }),
    );
    state = reducer(
      state,
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: preservation(),
        viewport: VIEWPORT,
      }),
    );
    expect(state.windows["messages-window"].traySlot).toBe(0);
    expect(state.windows.fresh.traySlot).toBe(1);
    expect(state.windows.fresh.zIndex).not.toBe(
      state.windows["messages-window"].zIndex,
    );
  });

  it("makes an explicit close a synchronous anti-resurrection tombstone", () => {
    let state = reducer(
      fresh(),
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: preservation(),
      }),
    );
    state = reducer(
      state,
      markWindowClosing({
        overlayId: "messagesWindow",
        instanceId: "default",
      }),
    );
    state = reducer(
      state,
      updateWindowPersistence({
        id: "messages-window",
        data: { conversationId: "late-unmount-write" },
      }),
    );
    expect(state.windows["messages-window"].persistence).toMatchObject({
      closing: true,
      data: {},
    });
  });

  it("tombstones direct overlay close actions used by generated openers", () => {
    let state = reducer(
      fresh(),
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: preservation(),
      }),
    );
    state = reducer(state, {
      type: "overlays/closeOverlay",
      payload: { overlayId: "messagesWindow" },
    });
    expect(state.windows["messages-window"].persistence?.closing).toBe(true);
    expect(
      serializeWindowWorkspace(state, "workspace-1").workspace.sessions,
    ).toEqual([]);
  });

  it("includes lazy pending sessions in every early workspace save", () => {
    const state = reducer(fresh(), hydrateAction([restoredSession()]));
    expect(
      serializeWindowWorkspace(state, "workspace-1").workspace.sessions,
    ).toHaveLength(1);
  });

  it("applies tray restore, move, and resize operations to pending reservations", () => {
    let state = reducer(fresh(), hydrateAction([restoredSession()]));
    state = reducer(state, registerWindow({ id: "fresh", initial: FULL_RECT }));
    state = reducer(
      state,
      minimizeWindow({
        id: "fresh",
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
      }),
    );
    state = reducer(state, moveTraySlot({ id: "fresh", toSlot: 0 }));
    expect(state.windows.fresh.traySlot).toBe(0);
    expect(state.pendingRestores["messagesWindow:default"].traySlot).toBe(1);

    state = reducer(
      state,
      recomputeTrayPositions({ viewportWidth: 900, viewportHeight: 600 }),
    );
    expect(state.pendingRestores["messagesWindow:default"].renderRect).toEqual(
      traySlotRect(1, 900, 600),
    );

    state = reducer(state, restoreAll());
    expect(state.trayCount).toBe(0);
    expect(state.pendingRestores["messagesWindow:default"]).toMatchObject({
      state: "windowed",
      traySlot: null,
    });
  });
});

describe("window workspace serialization", () => {
  it("stores the full pre-minimized rectangle and recomputes tray geometry", () => {
    let state = reducer(
      fresh(),
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: {
          ...preservation(),
          data: { conversationId: "conversation-1", rejected: "no" },
        },
      }),
    );
    state = reducer(
      state,
      minimizeWindow({
        id: "messages-window",
        viewportWidth: VIEWPORT.width,
        viewportHeight: VIEWPORT.height,
      }),
    );

    const serialized = serializeWindowWorkspace(state, "workspace-1", 99);
    expect(serialized.workspace.sessions).toHaveLength(1);
    expect(serialized.workspace.sessions[0]).toMatchObject({
      windowedRect: FULL_RECT,
      data: { conversationId: "conversation-1" },
      state: "minimized",
      savedAt: 99,
    });

    const hydrated = hydrateWindowWorkspace(serialized.workspace, {
      width: 900,
      height: 600,
    });
    expect(hydrated.sessions[0].windowedRect).toEqual(FULL_RECT);
    expect(hydrated.sessions[0].renderRect).toEqual(traySlotRect(0, 900, 600));
    expect(hydrated.sessions[0].traySlot).toBe(0);

    let restoredState = reducer(fresh(), hydrateAction(hydrated.sessions));
    restoredState = reducer(
      restoredState,
      registerWindow({
        id: "messages-window",
        initial: FULL_RECT,
        persistence: preservation(),
        viewport: VIEWPORT,
      }),
    );
    restoredState = reducer(restoredState, restoreWindow("messages-window"));
    expect(restoredState.windows["messages-window"].windowed).toEqual(
      FULL_RECT,
    );
  });

  it("normalizes duplicate tray slots and z order deterministically", () => {
    const first = restoredSession({
      overlayId: "singleMessageWindow",
      instanceId: "a",
      traySlot: 9,
      zIndex: 40,
    });
    const second = restoredSession({
      overlayId: "singleMessageWindow",
      instanceId: "b",
      traySlot: 9,
      zIndex: 10,
    });
    const hydrated = hydrateWindowWorkspace(
      {
        schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        savedAt: 5,
        sessions: [first, second],
      },
      VIEWPORT,
    );
    expect(hydrated.sessions.map((session) => session.zIndex)).toEqual([
      1000, 1001,
    ]);
    expect(
      hydrated.sessions
        .map((session) => session.traySlot)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([0, 1]);
  });

  it("rejects malformed workspaces and disabled overlay records", () => {
    expect(hydrateWindowWorkspace({ sessions: [] }, VIEWPORT).sessions).toEqual(
      [],
    );
    const disabled = restoredSession({ overlayId: "workingDocumentWindow" });
    const result = hydrateWindowWorkspace(
      {
        schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        savedAt: 5,
        sessions: [disabled],
      },
      VIEWPORT,
    );
    expect(result.sessions).toEqual([]);
    expect(
      result.diagnostics.some((item) => item.code === "preservation-disabled"),
    ).toBe(true);
  });

  it("rejects workspace mismatches and non-default singleton instances", () => {
    const wrongInstance = restoredSession({ instanceId: "corrupt-instance" });
    const workspace = {
      schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
      workspaceId: "workspace-1",
      savedAt: 5,
      sessions: [wrongInstance],
    };
    expect(
      hydrateWindowWorkspace(workspace, VIEWPORT, "other-workspace").sessions,
    ).toEqual([]);
    expect(
      hydrateWindowWorkspace(workspace, VIEWPORT, "workspace-1").sessions,
    ).toEqual([]);
  });

  it("keeps a valid small full-size window minimized", () => {
    const small = restoredSession({
      windowedRect: { x: 10, y: 10, width: 280, height: 180 },
    });
    const result = hydrateWindowWorkspace(
      {
        schemaVersion: WINDOW_WORKSPACE_SCHEMA_VERSION,
        workspaceId: "workspace-1",
        savedAt: 5,
        sessions: [small],
      },
      VIEWPORT,
      "workspace-1",
    );
    expect(result.sessions[0].state).toBe("minimized");
    expect(result.sessions[0].windowedRect).toMatchObject({
      width: 280,
      height: 180,
    });
  });

  it("drops callbacks and cycles while retaining allowlisted JSON", () => {
    const cyclic: Record<string, unknown> = {
      conversationId: "conversation-1",
      callback: () => undefined,
    };
    cyclic.self = cyclic;
    const result = sanitizeWindowSessionData(cyclic, [
      "conversationId",
      "callback",
      "self",
    ]);
    expect(result.data).toEqual({ conversationId: "conversation-1" });
    expect(result.droppedUnsupported).toBe(true);
  });
});
