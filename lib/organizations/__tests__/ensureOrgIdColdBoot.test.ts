/**
 * ensureOrgIdColdBoot.test.ts — A FALSE REFUSAL IS A DEFECT, NOT A SAFE DEFAULT.
 *
 * THE DEFECT (2026-09-17): `ensureOrgId` joined only `store._sync.boot()` —
 * the sync engine's WARM-CACHE hydration — before deciding there was no
 * organization. That is the whole answer on a returning session, where the
 * person's last organization comes back out of IndexedDB. On a FIRST-EVER
 * session there is no local record and no apex cookie, so the only answer
 * comes from `appContextPolicy.remote.fetch`, which deliberately waits for
 * `whenPageIdle` before spending the network. Every write made in that window
 * — an autosave, a first note, a canvas score — was refused with "Select an
 * organization" although the person HAS one and the app was seconds from
 * finding it.
 *
 * SUT: the real `ensureOrgId`, the real `getActiveOrgId`, the real appContext
 * reducer and the real `orgBootstrapGate`. The doubles are the Supabase RPC
 * (network) and `_sync.boot` (an external engine).
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

import appContextReducer, {
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

const rpc = jest.fn<(fn: string) => Promise<{ data: string | null; error: unknown }>>();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (fn: string) => rpc(fn) },
}));

let store = configureStore({ reducer: { appContext: appContextReducer } });
const boot = jest.fn<() => Promise<void>>();
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => store.getState(),
    dispatch: store.dispatch,
    _sync: { boot },
  }),
}));

import { ensureOrgId } from "../personalOrg";
import {
  markOrgBootstrapResolved,
  resetOrgBootstrapGate,
} from "../orgBootstrapGate";

const ORG = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  store = configureStore({ reducer: { appContext: appContextReducer } });
  resetOrgBootstrapGate();
  rpc.mockReset();
  boot.mockReset();
  boot.mockResolvedValue(undefined);
});

it("waits for the COLD-BOOT answer instead of refusing a person who has an organization", async () => {
  // Nothing cached, nothing selected, boot has not answered yet — exactly a
  // first-ever session with a write in flight.
  const pending = ensureOrgId(null);

  // The boot path answers a moment later, the way the idle remote fetch does.
  setTimeout(() => {
    store.dispatch(setOrganization({ id: ORG, name: "Acme" }));
    markOrgBootstrapResolved();
  }, 25);

  await expect(pending).resolves.toBe(ORG);
  // And it did it without a single extra network call of its own.
  expect(rpc).not.toHaveBeenCalled();
});

it("REFUSES once the answer is in and it is 'no organization'", async () => {
  markOrgBootstrapResolved();
  await ensureOrgId(null).then(
    () => {
      throw new Error("expected a refusal, got an organization");
    },
    (err) => {
      expect(isOrganizationRequiredError(err)).toBe(true);
    },
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("never waits when an organization is already selected", async () => {
  store.dispatch(setOrganization({ id: ORG, name: "Acme" }));
  await expect(ensureOrgId(null)).resolves.toBe(ORG);
});

it("takes an explicitly passed organization without consulting anything", async () => {
  await expect(ensureOrgId(ORG)).resolves.toBe(ORG);
  expect(boot).not.toHaveBeenCalled();
});

it("gives up after the bound rather than hanging the write forever", async () => {
  // The gate never settles here. The write must still end — refusing late is
  // survivable, hanging is not.
  const started = Date.now();
  await ensureOrgId(null).then(
    () => {
      throw new Error("expected a refusal");
    },
    (err) => expect(isOrganizationRequiredError(err)).toBe(true),
  );
  expect(Date.now() - started).toBeLessThan(30_000);
}, 30_000);
