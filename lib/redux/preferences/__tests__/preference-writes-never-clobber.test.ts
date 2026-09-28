/**
 * GUARD — a preference save never overwrites a key it did not change.
 *
 * 2026-09-27, live: an agent set `organization.defaultOrganizationId` at
 * 23:28:56; at 23:29:11 the row held null again with nobody acting. A browser
 * whose cached record predated the agent's write saved a preference and the
 * policy wrote its WHOLE cached record (`update({ preferences: body })`),
 * putting the old value back.
 *
 * Proven through the REAL write path — `userPreferencesPolicy.remote.write`,
 * and the whole sync engine (middleware → debounced scheduler → write) — with
 * only the Supabase client replaced by one in-memory row that honours the
 * `version` compare-and-swap exactly like Postgres + `platform._touch_row`.
 *
 * Red on the old code (whole-record update): both "two clients" cases lose
 * the first writer's key. Green now.
 */
import "fake-indexeddb/auto";
import { configureStore } from "@reduxjs/toolkit";

type Row = { user_id: string; version: number; preferences: Record<string, unknown> };
const USER = "u-clobber";
let row: Row;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A structural stand-in for `supabase.schema("users").from("user_preferences")`
 * over ONE row. Reads return a copy; an UPDATE filtered by `version` matches
 * only the live version (CAS), and every UPDATE bumps `version` the way the
 * `trg_touch_row` trigger does. `.update({ preferences })` with no version
 * filter (the old whole-record write) is honoured too, so the red run
 * exercises the old code honestly.
 */
function mockTable() {
  const filters: Record<string, unknown> = {};
  let patch: Partial<Row> | null = null;
  const run = () => {
    const matches =
      filters.user_id === row.user_id &&
      (filters.version === undefined || filters.version === row.version);
    if (patch) {
      if (!matches) return { data: null, error: null, rows: [] as Row[] };
      row = {
        ...row,
        ...clone(patch),
        version: row.version + 1, // trg_touch_row: OLD.version + 1
      } as Row;
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
    // Awaiting the builder without .maybeSingle() (the old write path).
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
      const r = run();
      return Promise.resolve(resolve({ data: r.rows, error: null }));
    },
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: () => mockTable() }),
  },
}));

import userPreferencesReducer, {
  setPreference,
  userPreferencesPolicy,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { createSyncMiddleware } from "@/lib/sync/engine/middleware";
import { invokeRemoteFetch } from "@/lib/sync/engine/remoteFetch";
import type { SyncChannel } from "@/lib/sync/channel";
import type { IdentityKey } from "@/lib/sync/types";

const person: IdentityKey = { type: "auth", userId: USER, key: `auth:${USER}` };

const RECORD = {
  display: { darkMode: false },
  organization: { defaultOrganizationId: "org-ashford", switchWhenALinkAsks: true },
  sandbox: { tier: "hosted", template: "aidream" },
};

beforeEach(() => {
  row = { user_id: USER, version: 1, preferences: clone(RECORD) };
});

const write = userPreferencesPolicy.config.remote!.write!;
const tab = (edit: (p: typeof RECORD) => void) => {
  const base = clone(RECORD);
  const body = clone(RECORD);
  edit(body);
  return { base, body };
};

describe("two clients change different keys — both survive", () => {
  it("through the policy's remote.write", async () => {
    // Both tabs loaded the same record, then each changed ONE different key.
    const a = tab((p) => (p.organization.defaultOrganizationId = "org-workspace"));
    const b = tab((p) => (p.display.darkMode = true));

    const signal = new AbortController().signal;
    await write({ identity: person, signal, body: a.body as never, base: a.base as never });
    await write({ identity: person, signal, body: b.body as never, base: b.base as never });

    const saved = row.preferences as typeof RECORD;
    expect(saved.organization.defaultOrganizationId).toBe("org-workspace");
    expect(saved.display.darkMode).toBe(true);
    // Untouched keys stay untouched.
    expect(saved.sandbox).toEqual(RECORD.sandbox);
    expect(saved.organization.switchWhenALinkAsks).toBe(true);
  });

  it("through the whole sync engine: an agent's write survives a stale tab's save", async () => {
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
          createSyncMiddleware({
            policies: [userPreferencesPolicy],
            channel,
            getIdentity: () => person,
          }),
        ),
    });
    // The tab loads the record…
    await invokeRemoteFetch({
      policy: userPreferencesPolicy,
      store,
      getIdentity: () => person,
      reason: "cold-boot",
    });
    expect(store.getState().userPreferences.organization.defaultOrganizationId).toBe(
      "org-ashford",
    );

    // …an agent changes the default organization directly in the row…
    row = {
      ...row,
      version: row.version + 1,
      preferences: {
        ...row.preferences,
        organization: { ...RECORD.organization, defaultOrganizationId: "org-workspace" },
      },
    };

    // …and the stale tab saves an unrelated preference.
    store.dispatch(setPreference({ module: "display", preference: "darkMode", value: true }));
    await new Promise((r) => setTimeout(r, 450)); // past the 250ms debounce

    const saved = row.preferences as typeof RECORD;
    expect(saved.display.darkMode).toBe(true);
    expect(saved.organization.defaultOrganizationId).toBe("org-workspace");
  });

  it("a save with nothing changed writes nothing", async () => {
    const same = tab(() => {});
    await write({
      identity: person,
      signal: new AbortController().signal,
      body: same.body as never,
      base: same.base as never,
    });
    expect(row.version).toBe(1);
  });
});
