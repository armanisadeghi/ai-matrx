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

jest.mock("@ai-matrx/design-system", () => ({
  ...jest.requireActual("@ai-matrx/design-system"),
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
import { bootSync, resyncForIdentity } from "@/lib/sync/engine/boot";
import { clearAll, readSlice } from "@/lib/sync/persistence/idb";
import { forgetAccountPreferencesRow } from "@/lib/account/accountPreferencesRow";
import { retryPreferencesLoad } from "@/lib/redux/preferences/preferencesLoad";
import { addFavorite } from "@/lib/redux/preferences/userPreferencesSlice";
import type { AppStore } from "@/lib/redux/store";
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
  // The account row is read once and shared for a moment; each case starts with none held.
  forgetAccountPreferencesRow();
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
    forgetAccountPreferencesRow(); // a stale refresh runs a minute on; the shared read is long gone
    await load(store, "stale-refresh");
    const state = store.getState().userPreferences;
    expect(state._meta.loadStatus).toBe("loaded");
    expect(state._meta.error).toContain("timeout");
    expect(state.sandbox.tier).toBe("ec2");
  });
});

function makeSyncedStore() {
  const channel: SyncChannel = {
    available: true,
    post: () => {},
    subscribe: () => () => {},
    setIdentity: () => {},
    close: () => {},
  };
  return configureStore({
    reducer: { userPreferences: userPreferencesReducer },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }).concat(
        createSyncMiddleware({ policies: [userPreferencesPolicy], channel, getIdentity: () => person }),
      ),
  });
}

/** Past the policy's 250ms debounce. */
const pastDebounce = () => new Promise((r) => setTimeout(r, 450));

type WrittenBody = {
  sandbox?: { tier?: string; template?: string };
  favorites?: { items?: { id: string }[] };
};

describe("edits before the saved record loads are held, then merged onto it", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await clearAll();
  });

  it("with the load FAILED, an edit reaches neither the server nor the local cache", async () => {
    const store = makeSyncedStore();
    nextAnswer = { data: null, error: { message: "network down" } };
    await load(store);
    store.dispatch(setPreference({ module: "sandbox", preference: "tier", value: "ec2" }));
    // The edit is on screen at once…
    expect(store.getState().userPreferences.sandbox.tier).toBe("ec2");
    await pastDebounce();
    // …but nothing was written anywhere: the defaults under it never replace the saved record.
    expect(remoteWrites).toEqual([]);
    expect(await readSlice(person.key, "userPreferences", userPreferencesPolicy.config.version)).toBeNull();
    expect(store.getState().userPreferences._meta.pendingEdits).toHaveLength(1);
  });

  it("when a retry loads the REAL record, the held edits are replayed on it and saved once", async () => {
    const store = makeSyncedStore();
    nextAnswer = { data: null, error: { message: "network down" } };
    await load(store);
    store.dispatch(setPreference({ module: "sandbox", preference: "tier", value: "ec2" }));
    store.dispatch(addFavorite({ id: "fav-new", kind: "nav", label: "New", href: "/new", pinnedAt: "2026-09-26T00:00:00Z" }));
    await pastDebounce();
    expect(remoteWrites).toEqual([]);

    // The saved record: a different template and an existing favorite.
    nextAnswer = {
      data: {
        preferences: {
          sandbox: { template: "aidream", tier: "hosted" },
          favorites: { items: [{ id: "fav-saved", kind: "nav", label: "Saved", href: "/saved" }] },
        },
      },
      error: null,
    };
    await load(store, "manual");
    const state = store.getState().userPreferences;
    expect(state._meta.loadStatus).toBe("loaded");
    expect(state._meta.pendingEdits).toEqual([]);
    // Merged: the saved template survives, the held edit wins where it spoke.
    expect(state.sandbox.template).toBe("aidream");
    expect(state.sandbox.tier).toBe("ec2");
    expect(state.favorites.items.map((f) => f.id)).toEqual(["fav-new", "fav-saved"]);

    await pastDebounce();
    expect(remoteWrites).toHaveLength(1);
    const body = remoteWrites[0] as { preferences: WrittenBody };
    expect(body.preferences.sandbox?.template).toBe("aidream");
    expect(body.preferences.sandbox?.tier).toBe("ec2");
    expect(body.preferences.favorites?.items?.map((f) => f.id)).toEqual(["fav-new", "fav-saved"]);
  });

  it("once loaded, an edit saves normally", async () => {
    const store = makeSyncedStore();
    nextAnswer = { data: { preferences: { sandbox: { tier: "hosted" } } }, error: null };
    await load(store);
    await pastDebounce();
    expect(remoteWrites).toEqual([]);
    store.dispatch(setPreference({ module: "sandbox", preference: "tier", value: "ec2" }));
    await pastDebounce();
    expect(remoteWrites).toHaveLength(1);
  });
});

describe("a startup sync that throws never leaves preferences loading forever", () => {
  it("boot throws → failed, with the error", async () => {
    const store = makeStore();
    await expect(
      bootSync({
        store,
        identity: person,
        policies: [userPreferencesPolicy],
        openChannel: () => {
          throw new Error("sync channel could not open");
        },
      }),
    ).rejects.toThrow("sync channel could not open");
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("failed");
    expect(meta.error).toContain("sync channel could not open");
  });

  it("an identity resync that throws → failed, with the error (and it still never rejects)", async () => {
    const store = makeStore();
    await expect(
      resyncForIdentity({
        store,
        identity: person,
        previousIdentity: { type: "guest", fingerprintId: "g", key: "guest:g" },
        policies: [userPreferencesPolicy],
        getIdentity: () => {
          throw new Error("identity unreadable");
        },
      }),
    ).resolves.toBeUndefined();
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("failed");
    expect(meta.error).toContain("identity unreadable");
  });

  it("a retry that throws before the read → failed, with the error", async () => {
    const store = makeStore();
    const noSync = Object.assign(store, {
      _sync: {
        getIdentity: () => {
          throw new Error("no sync context");
        },
      },
    }) as unknown as AppStore;
    await retryPreferencesLoad(noSync);
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("failed");
    expect(meta.error).toContain("no sync context");
  });

  it("a failure notice never downgrades a record that already loaded", async () => {
    const store = makeStore();
    nextAnswer = { data: { preferences: { sandbox: { tier: "ec2" } } }, error: null };
    await load(store);
    await expect(
      bootSync({
        store,
        identity: person,
        policies: [userPreferencesPolicy],
        openChannel: () => {
          throw new Error("late boot failure");
        },
      }),
    ).rejects.toThrow();
    const meta = store.getState().userPreferences._meta;
    expect(meta.loadStatus).toBe("loaded");
    expect(meta.error).toContain("late boot failure");
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
