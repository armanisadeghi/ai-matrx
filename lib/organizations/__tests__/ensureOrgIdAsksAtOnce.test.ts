/**
 * ensureOrgIdAsksAtOnce.test.ts — THE ASK IS NEVER BEHIND A WAIT FOR AN ANSWER
 * THAT HAS ALREADY BEEN GIVEN.
 *
 * THE DEFECT (2026-10-07): /education/flashcards/new, a web page added with no
 * active organization sat on "Reading the page…" for 40+ seconds on the first
 * attempt (no ask), and only after a reload showed "Waiting for an
 * organization". `ensureOrgId` awaited the sync engine's warm-cache hydration
 * (`_sync.boot()`, which reads every persisted slice) and the boot gate BEFORE
 * asking, even when the app's own state already said the organization question
 * was answered ("none"). Waiting for an answer that exists is a hang; the ask
 * must come at once and the write continue by itself once one is chosen.
 *
 * SUT: the real `ensureOrgId`, the real appContext reducer and the real
 * `orgBootstrapGate`. The doubles are `_sync.boot` (an external engine that
 * never settles here) and the gate's ask (the dialog).
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

import appContextReducer, {
  setOrganization,
  setOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";

let store = configureStore({ reducer: { appContext: appContextReducer } });
const boot = jest.fn<() => Promise<void>>();
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => store.getState(),
    dispatch: store.dispatch,
    _sync: { boot },
  }),
}));

const ask = jest.fn<() => Promise<string>>();
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationForWrite: () => ask(),
}));

import { ensureOrgId } from "../ensureOrgId";
import { resetOrgBootstrapGate } from "../orgBootstrapGate";

const CHOSEN = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  store = configureStore({ reducer: { appContext: appContextReducer } });
  resetOrgBootstrapGate();
  boot.mockReset();
  boot.mockReturnValue(new Promise<void>(() => undefined)); // never settles
  ask.mockReset();
  ask.mockResolvedValue(CHOSEN);
});

it("asks at once when the app already knows there is no organization, without waiting on hydration", async () => {
  store.dispatch(setOrganization({ id: null }));
  store.dispatch(setOrgBootstrapResolved(true));
  const outcome = await Promise.race([
    ensureOrgId(null),
    new Promise<string>((resolve) => setTimeout(() => resolve("HUNG"), 500)),
  ]);
  expect(ask).toHaveBeenCalledTimes(1);
  expect(outcome).toBe(CHOSEN);
});

it("still joins hydration while the organization question is genuinely unanswered", async () => {
  boot.mockResolvedValue(undefined);
  store.dispatch(setOrganization({ id: null }));
  // not resolved: boot is awaited (and here answers nothing), then the cold-boot wait is bounded by the gate
  const racing = Promise.race([
    ensureOrgId(null),
    new Promise<string>((resolve) => setTimeout(() => resolve("WAITING"), 200)),
  ]);
  await expect(racing).resolves.toBe("WAITING");
  expect(boot).toHaveBeenCalled();
});
