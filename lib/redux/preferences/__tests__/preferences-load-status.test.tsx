/**
 * The person's saved preferences are loaded by the sync engine
 * (`invokeRemoteFetch` over `userPreferencesPolicy`). Until 2026-09-26 a
 * failed load was indistinguishable from "this person saved nothing": the
 * policy's fetch turned the Supabase error into `null`, the engine dispatched
 * nothing, and `_meta.error` was only ever CLEARED — so every settings page
 * rendered built-in defaults as the person's settings.
 *
 * Proven here through the REAL load path (policy fetch → engine → slice) with
 * only the Supabase client stubbed, and through the shared settings gate.
 */
import "fake-indexeddb/auto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("@/components/errors/ErrorNotice", () => ({
  ErrorNotice: ({ title, message, error, actions }: { title?: string; message?: string; error?: unknown; actions?: React.ReactNode }) => (
    <div data-error-notice="">
      {title} {message ?? String((error as Error)?.message ?? error)}
      {actions}
    </div>
  ),
}));

type SupabaseAnswer = { data: { preferences: unknown } | null; error: { message: string; code?: string } | null };
let nextAnswer: SupabaseAnswer = { data: null, error: null };
/** Every body the policy's remote.write tried to store. */
const remoteWrites: unknown[] = [];
jest.mock("@/utils/supabase/client", () => {
  const chain = {
    schema: () => chain,
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    update: (body: unknown) => {
      remoteWrites.push(body);
      return chain;
    },
    abortSignal: () => Promise.resolve({ data: [{ user_id: "u-prefs" }], error: null }),
    maybeSingle: async () => nextAnswer,
  };
  // `.abortSignal()` ends the write chain (awaited) and continues the read chain.
  const read = { ...chain, abortSignal: () => read };
  return {
    supabase: {
      schema: () => ({
        from: () => ({
          select: () => ({ eq: () => read }),
          update: chain.update,
        }),
      }),
    },
  };
});

import userPreferencesReducer, {
  resetAllPreferences,
  setPreference,
  userPreferencesPolicy,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { invokeRemoteFetch } from "@/lib/sync/engine/remoteFetch";
import { createSyncMiddleware } from "@/lib/sync/engine/middleware";
import type { SyncChannel } from "@/lib/sync/channel";
import type { IdentityKey } from "@/lib/sync/types";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";

const person: IdentityKey = { type: "auth", userId: "u-prefs", key: "auth:u-prefs" };

function makeStore() {
  return configureStore({ reducer: { userPreferences: userPreferencesReducer } });
}

async function load(store: ReturnType<typeof makeStore>, reason: "cold-boot" | "stale-refresh" | "manual" = "cold-boot") {
  await invokeRemoteFetch({ policy: userPreferencesPolicy, store, getIdentity: () => person, reason });
}

beforeEach(() => {
  nextAnswer = { data: null, error: null };
  remoteWrites.length = 0;
});

describe("userPreferences load status", () => {
  it("starts as loading: the store holds defaults, not the person's settings", () => {
    const store = makeStore();
    expect(store.getState().userPreferences._meta.loadStatus).toBe("loading");
  });

  it("a FAILED load records failed + the error — it is not 'nothing saved'", async () => {
    const store = makeStore();
    nextAnswer = { data: null, error: { message: "permission denied for table user_preferences", code: "42501" } };
    await load(store);
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("failed");
    expect(meta.error).toContain("permission denied for table user_preferences");
  });

  it("an edit does not erase why the load failed", async () => {
    const store = makeStore();
    nextAnswer = { data: null, error: { message: "network down" } };
    await load(store);
    store.dispatch(setPreference({ module: "sandbox", preference: "tier", value: "ec2" }));
    store.dispatch(resetAllPreferences());
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("failed");
    expect(meta.error).toContain("network down");
  });

  it("a retry (the same load, reason manual) that succeeds clears the failure", async () => {
    const store = makeStore();
    nextAnswer = { data: null, error: { message: "network down" } };
    await load(store);
    nextAnswer = { data: { preferences: { sandbox: { tier: "ec2" } } }, error: null };
    await load(store, "manual");
    const state = store.getState().userPreferences;
    expect(state._meta.loadStatus).toBe("loaded");
    expect(state._meta.error).toBeNull();
    expect(state.sandbox.tier).toBe("ec2");
  });

  it("no saved record: loaded — the defaults ARE this person's preferences", async () => {
    const store = makeStore();
    await load(store);
    expect(store.getState().userPreferences._meta.loadStatus).toBe("loaded");
  });

  it("a failed background refresh keeps the record that already loaded, and says why", async () => {
    const store = makeStore();
    nextAnswer = { data: { preferences: { sandbox: { tier: "ec2" } } }, error: null };
    await load(store);
    nextAnswer = { data: null, error: { message: "timeout" } };
    await load(store, "stale-refresh");
    const state = store.getState().userPreferences;
    expect(state._meta.loadStatus).toBe("loaded");
    expect(state._meta.error).toContain("timeout");
    expect(state.sandbox.tier).toBe("ec2");
  });
});

describe("a failed load never writes the defaults over the saved record", () => {
  it("the load-status bookkeeping is not persisted by the sync middleware", async () => {
    const channel: SyncChannel = {
      available: true,
      post: () => {},
      subscribe: () => () => {},
      setIdentity: () => {},
      close: () => {},
    };
    const store = configureStore({
      reducer: { userPreferences: userPreferencesReducer },
      middleware: (gDM) =>
        gDM({ serializableCheck: false, immutableCheck: false }).concat(
          createSyncMiddleware({ policies: [userPreferencesPolicy], channel, getIdentity: () => person }),
        ),
    });
    nextAnswer = { data: null, error: { message: "network down" } };
    await invokeRemoteFetch({ policy: userPreferencesPolicy, store, getIdentity: () => person, reason: "cold-boot" });
    expect(store.getState().userPreferences._meta.loadStatus).toBe("failed");
    // Past the policy's 250ms debounce: nothing may have been written.
    await new Promise((r) => setTimeout(r, 450));
    expect(remoteWrites).toEqual([]);
  });
});

describe("PreferencesLoadGate (the settings tab host's gate)", () => {
  const form = <p data-form="">Tier: hosted</p>;

  it("failed: the failure with a retry, never the defaults form", async () => {
    const store = makeStore();
    nextAnswer = { data: null, error: { message: "permission denied for table user_preferences" } };
    await load(store);
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <PreferencesLoadGate what="your Sandbox settings">{form}</PreferencesLoadGate>
      </Provider>,
    );
    expect(html).toContain("data-error-notice");
    expect(html).toContain("Couldn&#x27;t load your Sandbox settings");
    expect(html).toContain("permission denied for table user_preferences");
    expect(html).toContain("Try again");
    expect(html).not.toContain("data-form");
  });

  it("loading: a wait, never the defaults form", () => {
    const store = makeStore();
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <PreferencesLoadGate what="your Sandbox settings">{form}</PreferencesLoadGate>
      </Provider>,
    );
    expect(html).toContain("aria-busy");
    expect(html).not.toContain("data-form");
  });

  it("loaded: the form", async () => {
    const store = makeStore();
    await load(store);
    const html = renderToStaticMarkup(
      <Provider store={store}>
        <PreferencesLoadGate>{form}</PreferencesLoadGate>
      </Provider>,
    );
    expect(html).toContain("data-form");
  });
});
