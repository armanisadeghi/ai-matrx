/**
 * GUARD: following the host ports can never recurse.
 *
 * A host port reading the same store subscribes with `store.subscribe` (the app's adapter does
 * exactly that), so `followChatHost` runs INSIDE every dispatch, including its own
 * `chatHostSynced`. When the slice can never equal the port snapshot, every sync re-entered
 * itself until the stack ran out. That killed /schedules on a phone on 2026-10-02 with
 * "RangeError: Maximum call stack size exceeded"; the stack was the store's middleware chain,
 * over and over. Two ways the slice and the ports disagree for good:
 *   - a port value that is equal but never the SAME reference (a fresh object per read);
 *   - a second writer (the app's root reducer) that rewrites the field the port reports.
 * Either one is a host defect, so it is announced once. It must never take the page down.
 */

import { combineReducers, configureStore, type Reducer, type UnknownAction } from "@reduxjs/toolkit";
import { DEFAULT_CHAT_PREFERENCES } from "../../host/defaults/prefs";
import { _resetAnnouncements } from "../../host/errors";
import { resolveChatHost } from "../../host/configure";
import { createFakeDb } from "../../host/__tests__/fake-db";
import type { ChatPreferences, ChatPrefsPort } from "../../host/contract";
import { followChatHost } from "../chat-host-sync";
import { chatHostReducer, chatHostSynced, type ChatHostState } from "../chat-host.slice";
import { PRIYA } from "./chat-host-test-ports";

type State = { chatHost: ChatHostState; ticks: number };

const ticks: Reducer<number> = (n = 0, action) => (action.type === "test/tick" ? n + 1 : n);

function storeWith(chatHost: Reducer<ChatHostState, UnknownAction> = chatHostReducer) {
  return configureStore({
    reducer: combineReducers({ chatHost, ticks }) as unknown as Reducer<State>,
    middleware: (gDM) => gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

/** Ports that read and subscribe to the same store, as the app's adapter does. */
function storePorts(store: { subscribe: (l: () => void) => () => void }, preferences: () => ChatPreferences) {
  const prefs: ChatPrefsPort = {
    get: () => null,
    set: () => {},
    remove: () => {},
    subscribe: () => () => {},
    knob: (_key, fallback) => fallback,
    snapshot: () => ({}),
    preferences,
    subscribePreferences: (listener) => store.subscribe(listener),
  };
  return resolveChatHost({
    db: createFakeDb().db,
    identity: { current: () => PRIYA, subscribe: (l) => store.subscribe(l), getAccessToken: async () => null },
    org: { active: () => null, subscribe: (l) => store.subscribe(l), require: async () => "org" },
    prefs,
    server: { baseUrl: () => "https://server.app.matrxserver.com" },
  });
}

function countSyncs(store: { subscribe: (l: () => void) => () => void }, getState: () => State) {
  let syncs = 0;
  let last = getState().chatHost;
  store.subscribe(() => {
    const now = getState().chatHost;
    if (now !== last) syncs += 1;
    last = now;
  });
  return () => syncs;
}

describe("following the host ports never re-enters itself", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    _resetAnnouncements();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("a port value that is equal but never the same reference: no overflow, at most one sync per notification", () => {
    const store = storeWith();
    // A fresh value object on every read, as a host that builds `{...}` per call returns.
    const host = storePorts(store, () => ({
      ...DEFAULT_CHAT_PREFERENCES,
      creatorSettings: { ...DEFAULT_CHAT_PREFERENCES.creatorSettings },
    }));
    followChatHost(store, host);
    const syncs = countSyncs(store, store.getState);

    for (let i = 0; i < 10; i += 1) {
      expect(() => store.dispatch({ type: "test/tick" })).not.toThrow();
    }
    expect(store.getState().ticks).toBe(10);
    // Three store-backed notifications (identity, org, preferences) per outside dispatch, and
    // none of them re-enters: the count is bounded by the dispatches, never by the stack.
    expect(syncs()).toBeLessThanOrEqual(10 * 3);
    expect(store.getState().chatHost.synced).toBe(true);
    expect(errorSpy.mock.calls.filter((call) => String(call[0]).includes("never settles"))).toHaveLength(1);
  });

  it("a second writer that rewrites the field: no overflow, and the disagreement is announced once", () => {
    // The host's own reducer keeps `debugMode` true whatever the port reports.
    const rewriting: Reducer<ChatHostState, UnknownAction> = (state, action) => {
      const next = chatHostReducer(state, action);
      return next.preferences.debugMode ? next : { ...next, preferences: { ...next.preferences, debugMode: true } };
    };
    const store = storeWith(rewriting);
    const stable = { ...DEFAULT_CHAT_PREFERENCES, debugMode: false };
    followChatHost(store, storePorts(store, () => stable));

    expect(() => store.dispatch({ type: "test/tick" })).not.toThrow();
    expect(() => store.dispatch(chatHostSynced({ ...store.getState().chatHost }))).not.toThrow();
    expect(store.getState().ticks).toBe(1);
    const announced = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("never settles"),
    );
    expect(announced).toHaveLength(1);
  });
});
