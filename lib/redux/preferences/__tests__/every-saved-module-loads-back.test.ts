/**
 * EVERY SAVED PREFERENCE MODULE LOADS BACK (2026-10-02).
 *
 * The break this catches: the REHYDRATE merge named its modules one by one and had left out
 * `assists`, `connectors` and `reversible` — each was saved and never read back, so the
 * reversible action taught the same person "first time" on every visit. The persisted set and the
 * loaded set are now one record; this proves, for EVERY module, that a saved value survives a load.
 */
import reducer, {
  initializeUserPreferencesState,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";

function rehydrate(state: Partial<UserPreferences>) {
  return reducer(initializeUserPreferencesState(), {
    type: REHYDRATE_ACTION_TYPE,
    payload: { sliceName: "userPreferences", state },
    meta: { source: "idb" },
  } as never);
}

it("a front desk's archive history comes back after a reload", () => {
  const after = rehydrate({ reversible: { verbs: { archive: 3 }, pairs: { "archive:table": 2 } } });
  expect(after.reversible).toEqual({ verbs: { archive: 3 }, pairs: { "archive:table": 2 } });
  expect(after._meta.loadStatus).toBe("loaded");
});

it("the connector card's 'not now' and the assists dock position come back after a reload", () => {
  const after = rehydrate({
    connectors: { promptDismissedAt: { google: "2026-09-30T16:12:00.000Z" } },
    assists: { dockPosition: { right: 40, bottom: 96 }, quietUntil: null, presentationCycle: null },
  });
  expect(after.connectors.promptDismissedAt).toEqual({ google: "2026-09-30T16:12:00.000Z" });
  expect(after.assists.dockPosition).toEqual({ right: 40, bottom: 96 });
});

it("every module of the record survives a load (a sentinel key per module)", () => {
  const base = initializeUserPreferencesState();
  const keys = Object.keys(base).filter((k) => k !== "_meta") as (keyof UserPreferences)[];
  const saved = Object.fromEntries(
    keys.map((k) => [k, { ...(base[k] as object), __saved_sentinel: k }]),
  ) as unknown as Partial<UserPreferences>;
  const after = rehydrate(saved);
  const lost = keys.filter((k) => (after[k] as unknown as Record<string, unknown>)?.__saved_sentinel !== k);
  expect(lost).toEqual([]);
});
