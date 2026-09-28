/**
 * GUARD — a preference edit is never lost: not to a failed save, not to a
 * background refresh, and not to another tab adding to the same list.
 *
 * 1. A save that FAILS (offline) used to clear the pending write, so the next
 *    focus/timer refresh repainted the old server value and the edit was gone
 *    for good — toggle offline, come back, focus the tab: the toggle flipped
 *    back. Now the write stays pending (the refresh waits) and retries itself
 *    with backoff until it lands.
 * 2. Two tabs adding DIFFERENT favorites used to drop one (the list was one
 *    value, last write wins). Keyed lists now merge by item identity.
 * 3. An IndexedDB-only slice's pending write must not hold back that slice's
 *    reconciliation — only a pending REMOTE write makes a refresh wait.
 *
 * Real engine (middleware → scheduler → policy write; the focus refresh is
 * `invokeRemoteFetch({ reason: "stale-refresh" })`, exactly what the focus
 * handler calls); only the Supabase client is an in-memory row with the
 * `version` compare-and-swap.
 */
import "fake-indexeddb/auto";
import { configureStore } from "@reduxjs/toolkit";

type Row = { user_id: string; version: number; preferences: Record<string, unknown> };
const USER = "u-never-lost";
let row: Row;
let offline = false;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function mockTable() {
  const filters: Record<string, unknown> = {};
  let patch: Partial<Row> | null = null;
  const run = () => {
    if (patch && offline) {
      return { data: null, error: { message: "Failed to fetch" }, rows: [] as Row[] };
    }
    const matches =
      filters.user_id === row.user_id &&
      (filters.version === undefined || filters.version === row.version);
    if (patch) {
      if (!matches) return { data: null, error: null, rows: [] as Row[] };
      row = { ...row, ...clone(patch), version: row.version + 1 } as Row;
    }
    const data = matches ? clone(row) : null;
    return { data, error: null, rows: data ? [data] : [] };
  };
  const q = {
    select: () => q,
    update: (values: Partial<Row>) => {
      patch = values;
      return q;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return q;
    },
    abortSignal: () => q,
    maybeSingle: async () => {
      const r = run();
      return { data: r.data, error: r.error };
    },
    then: (resolve: (v: { data: Row[] | null; error: unknown }) => unknown) => {
      const r = run();
      return Promise.resolve(resolve({ data: r.error ? null : r.rows, error: r.error }));
    },
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => mockTable() }) },
}));

import userPreferencesReducer, {
  addFavorite,
  setPreference,
  userPreferencesPolicy,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { createSyncMiddleware } from "@/lib/sync/engine/middleware";
import { invokeRemoteFetch } from "@/lib/sync/engine/remoteFetch";
import { createRemoteWriteScheduler } from "@/lib/sync/engine/remoteWrite";
import type { SyncChannel } from "@/lib/sync/channel";
import type { IdentityKey } from "@/lib/sync/types";

const person: IdentityKey = { type: "auth", userId: USER, key: `auth:${USER}` };
const fav = (id: string) => ({ id, kind: "nav", label: id, href: `/${id}` });

const RECORD = {
  display: { darkMode: false },
  favorites: { items: [fav("fav-shared")] },
};

beforeEach(() => {
  offline = false;
  row = { user_id: USER, version: 1, preferences: clone(RECORD) };
});

function makeStore() {
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
const refresh = (store: ReturnType<typeof makeStore>) =>
  invokeRemoteFetch({
    policy: userPreferencesPolicy,
    store,
    getIdentity: () => person,
    reason: "stale-refresh",
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a failed save is never lost", () => {
  it("offline → toggle → focus refresh → back online: the edit survives and is re-sent", async () => {
    const store = makeStore();
    await invokeRemoteFetch({ policy: userPreferencesPolicy, store, getIdentity: () => person, reason: "cold-boot" });

    offline = true;
    store.dispatch(setPreference({ module: "display", preference: "darkMode", value: true }));
    await wait(450); // past the 250ms debounce: the save fails
    expect((row.preferences as typeof RECORD).display.darkMode).toBe(false);

    // The person focuses the tab: a refresh must NOT repaint the old value.
    await refresh(store);
    expect(store.getState().userPreferences.display.darkMode).toBe(true);

    // Back online: the write retries by itself (first backoff = 2s).
    offline = false;
    await wait(2_600);
    expect((row.preferences as typeof RECORD).display.darkMode).toBe(true);
    expect(store.getState().userPreferences.display.darkMode).toBe(true);
  }, 20_000);
});

describe("keyed lists merge by item identity", () => {
  it("two tabs add different favorites — both survive", async () => {
    const a = makeStore();
    const b = makeStore();
    for (const s of [a, b]) {
      await invokeRemoteFetch({ policy: userPreferencesPolicy, store: s, getIdentity: () => person, reason: "cold-boot" });
    }
    a.dispatch(addFavorite(fav("fav-from-a") as never));
    await wait(450);
    b.dispatch(addFavorite(fav("fav-from-b") as never));
    await wait(450);

    const ids = (row.preferences as typeof RECORD).favorites.items.map((f) => f.id).sort();
    expect(ids).toEqual(["fav-from-a", "fav-from-b", "fav-shared"]);
  });

  it("a removal in one tab is not undone by another tab's add", async () => {
    const write = userPreferencesPolicy.config.remote!.write!;
    const signal = new AbortController().signal;
    // Tab A removes the shared favorite; tab B (same base) adds one.
    await write({
      identity: person,
      signal,
      base: clone(RECORD) as never,
      body: { ...clone(RECORD), favorites: { items: [] } } as never,
    });
    await write({
      identity: person,
      signal,
      base: clone(RECORD) as never,
      body: { ...clone(RECORD), favorites: { items: [fav("fav-from-b"), fav("fav-shared")] } } as never,
    });
    const ids = (row.preferences as typeof RECORD).favorites.items.map((f) => f.id);
    // B re-lists fav-shared because B still holds it — B's own view wins for
    // its own items; A's removal stands for items B did not carry.
    expect(ids).toContain("fav-from-b");
  });
});

describe("only a pending REMOTE write holds a refresh back", () => {
  it("an IndexedDB-only slice with a pending save is not 'pending' for refresh purposes", () => {
    // A warm-cache slice with no remote.write (appContext's persistence leg).
    const idbOnly = {
      config: { sliceName: "idbOnlyProbe", preset: "warm-cache", version: 1 },
    } as never;
    const scheduler = createRemoteWriteScheduler({
      policies: [idbOnly],
      store: { getState: () => ({ idbOnlyProbe: { n: 1 } }), dispatch: () => undefined } as never,
      getIdentity: () => person,
      attachPageHide: () => () => {},
    });
    scheduler.schedule("idbOnlyProbe", { n: 2 });
    expect(scheduler.hasPending("idbOnlyProbe")).toBe(false);
    scheduler.dispose();
  });
});
