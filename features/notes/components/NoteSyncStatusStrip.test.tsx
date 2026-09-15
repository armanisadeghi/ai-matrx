/**
 * features/notes/components/NoteSyncStatusStrip.test.tsx
 *
 * THE BREAK THIS CATCHES: a notes screen that keeps looking live after the
 * realtime channel is gone (audit N-05, connection half). The chain under test
 * is the whole one — the realtime middleware's status door, the real notes
 * reducer, and the real strip component — because every honest sentence on
 * that strip depends on all three agreeing.
 *
 * Nothing here is stubbed except the two things this feature does not own: the
 * realtime manager (a stand-in that hands us the spec, so we can call the
 * package's own `onStatusChange` the way the socket would) and the Supabase
 * client (no network in a suite). The attempt COUNT is not faked either — it
 * is written onto real `ChannelMetrics` registered with the package, so the
 * middleware has to look our channel up by the right topic on the package's
 * real diagnostics snapshot to find it. Read the wrong topic, ignore the
 * count, or drop the poll, and the strip says "Reconnecting" forever while
 * the channel is dead.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, type Middleware } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import type { MiddlewareAPI } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  createChannelMetrics,
  createWriteLedger,
  registerChannelMetrics,
  setAmbientRealtimeManager,
  RECONNECT_ALARM_ATTEMPTS,
  type ChannelMetrics,
  type ChannelSpec,
  type RealtimeManager,
} from "@ai-matrx/realtime";
import notesReducer from "../redux/slice";
import { fetchNotesList } from "../redux/thunks";
import { notesRealtimeMiddleware } from "../redux/realtimeMiddleware";
import { NoteSyncStatusStrip } from "./NoteSyncStatusStrip";

jest.mock("@/utils/supabase/client", () => {
  const boom = () => {
    throw new Error("no network in this suite");
  };
  return {
    supabase: {
      rpc: jest.fn(() =>
        Promise.resolve({ data: null, error: { message: "no network" } }),
      ),
      schema: boom,
      from: boom,
    },
  };
});

enableMapSet();
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const USER = "user-1";
const TOPIC = `mx:notes:${USER}`;

function stubManager(): { manager: RealtimeManager; spec: () => ChannelSpec } {
  let captured: ChannelSpec | null = null;
  const manager = {
    clientId: "test-client",
    ledger: createWriteLedger({ actorId: USER }),
    open: (spec: ChannelSpec) => {
      captured = spec;
      return {
        topic: spec.topic,
        status: () => "connected" as const,
        send: () => {},
        presence: null,
        requestBackfill: () => {},
        close: () => {},
      };
    },
    health: () => "live" as const,
    backfillAll: () => {},
    openChannelCount: () => (captured ? 1 : 0),
    dispose: () => {},
  } as unknown as RealtimeManager;
  return {
    manager,
    spec: () => {
      if (!captured) throw new Error("the middleware opened no channel");
      return captured;
    },
  };
}

function makeStore() {
  const userAuthReducer = (state: { id: string | null } = { id: USER }) => state;
  return configureStore({
    reducer: { notes: notesReducer, userAuth: userAuthReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(
        notesRealtimeMiddleware as unknown as Middleware,
      ),
  });
}

describe("notes sync-status strip, driven by real channel status transitions", () => {
  let store: ReturnType<typeof makeStore>;
  let stub: ReturnType<typeof stubManager>;
  let metrics: ChannelMetrics;
  let unregisterMetrics: () => void;
  let host: HTMLDivElement;
  let root: Root;
  const reload = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    reload.mockClear();
    stub = stubManager();
    setAmbientRealtimeManager(stub.manager);
    // REAL package metrics for our real topic — this is what the middleware
    // has to find on the diagnostics snapshot to learn the attempt count.
    metrics = createChannelMetrics({
      topic: TOPIC,
      namespace: "notes",
      queueDepth: () => 0,
      queueDropped: () => 0,
    });
    unregisterMetrics = registerChannelMetrics(metrics);

    store = makeStore();
    store.dispatch(fetchNotesList.fulfilled(undefined, "request-1", undefined));

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <NoteSyncStatusStrip onReload={reload} />
        </Provider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    store.dispatch({ type: "notes/resetNotesState" });
    unregisterMetrics();
    setAmbientRealtimeManager(null);
    jest.useRealTimers();
  });

  /** Call the status callback the package would call from the socket. */
  function reportStatus(status: "connected" | "reconnecting" | "disconnected") {
    act(() => {
      (
        stub.spec() as ChannelSpec & {
          onStatusChange: (s: string) => void;
        }
      ).onStatusChange(status);
    });
  }

  it("says nothing while the channel is healthy", () => {
    reportStatus("connected");
    expect(store.getState().notes.realtimeStatus).toBe("connected");
    expect(host.textContent).toBe("");
  });

  it("says the channel is retrying while the package's backoff is still below its alarm", () => {
    metrics.failedAttempts = 1;
    reportStatus("reconnecting");

    expect(store.getState().notes.realtimeFailedAttempts).toBe(1);
    expect(host.querySelector("[role='status']")?.textContent).toContain(
      "Reconnecting live updates",
    );
    expect(host.querySelector("[role='alert']")).toBeNull();
    expect(host.textContent).not.toContain("Reload");
  });

  it("escalates to the broken notice with a Reload once the package passes its alarm threshold", () => {
    metrics.failedAttempts = 1;
    reportStatus("reconnecting");
    expect(host.querySelector("[role='alert']")).toBeNull();

    // The package's status callback is EDGE-triggered — it stays on
    // "reconnecting" for the whole ladder and never fires again. Only the
    // middleware's poll of the diagnostics snapshot can see this.
    metrics.failedAttempts = RECONNECT_ALARM_ATTEMPTS;
    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    expect(store.getState().notes.realtimeFailedAttempts).toBe(
      RECONNECT_ALARM_ATTEMPTS,
    );
    const alert = host.querySelector("[role='alert']");
    expect(alert?.textContent).toContain("Live updates are off");
    expect(alert?.textContent).toContain(
      "changes from other devices will not appear until you reload",
    );
    expect(host.querySelector("[role='status']")).toBeNull();

    const reloadButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Reload",
    );
    expect(reloadButton).toBeDefined();
    act(() => {
      reloadButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("clears the notice, and stops polling, when the channel comes back", () => {
    metrics.failedAttempts = RECONNECT_ALARM_ATTEMPTS;
    reportStatus("reconnecting");
    expect(host.querySelector("[role='alert']")).not.toBeNull();

    metrics.failedAttempts = 0;
    reportStatus("connected");
    expect(host.textContent).toBe("");

    // A poll left running would keep re-publishing a stale status over the
    // healthy one the moment the counter moved again.
    metrics.failedAttempts = 9;
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(store.getState().notes.realtimeStatus).toBe("connected");
    expect(host.textContent).toBe("");
  });

  it("treats a channel the package reports as closed as broken, not as retrying", () => {
    metrics.failedAttempts = 0;
    reportStatus("disconnected");

    expect(host.querySelector("[role='alert']")?.textContent).toContain(
      "Live updates are off",
    );
    expect(host.querySelector("[role='status']")).toBeNull();
  });

  it("stays silent before any channel has been opened", () => {
    // resetNotesState is what logout dispatches; the strip must not accuse the
    // network of a teardown we asked for.
    act(() => {
      store.dispatch({ type: "notes/resetNotesState" });
    });
    expect(store.getState().notes.realtimeStatus).toBe("idle");
    expect(host.textContent).toBe("");
  });
});
