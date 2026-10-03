/**
 * THE REMOUNT LAW FOR SAVED SURFACE STATE — a feature's `users.user_surface_state` rows are read
 * ONCE per tab. A chat tile that sleeps for a minute and wakes (its context chip and rail ask again
 * on mount) renders the kept rows and reads nothing; `force` is the explicit re-read.
 *
 * SUT: `ensureSurfaceFeatureLoaded` over the real slice.
 * Break: a freshness window on the kept rows (it was 30 s — every wake after that read again).
 */
const loadFeature = jest.fn(async () => ({ "conversation:7f2c": { rules: ["Cite the lease clause"] } }));
jest.mock("../../user-state/service", () => ({
  surfaceUserStateService: { loadFeature: (...a: unknown[]) => (loadFeature as (...b: unknown[]) => unknown)(...a) },
  DEFAULT_SURFACE_KEY: "_default",
}));
jest.mock("../../../host/identity", () => ({ requireUserId: () => "user-dana" }));

import { configureStore } from "@reduxjs/toolkit";
import { ensureSurfaceFeatureLoaded, surfaceUserStateReducer } from "../userStateSlice";

const makeStore = () => configureStore({ reducer: { surfaceUserState: surfaceUserStateReducer } });

it("a wake a minute later reads nothing; force reads again", async () => {
  let now = Date.parse("2026-10-03T10:00:00Z");
  jest.spyOn(Date, "now").mockImplementation(() => now);
  const store = makeStore();
  const ensure = (force = false) =>
    (store.dispatch as (t: unknown) => Promise<void>)(ensureSurfaceFeatureLoaded("context-rules", force));
  await ensure();
  now += 60_000;
  await ensure();
  await ensure();
  expect(loadFeature).toHaveBeenCalledTimes(1);
  expect(store.getState().surfaceUserState.byFeature["context-rules"]?.rows["conversation:7f2c"]).toEqual({
    rules: ["Cite the lease clause"],
  });
  await ensure(true);
  expect(loadFeature).toHaveBeenCalledTimes(2);
});
