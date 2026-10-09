/**
 * ensureOrgId.test.ts — the org-resolution contract for org-scoped writes.
 *
 * SUT: `ensureOrgId` (lib/organizations/ensureOrgId.ts) together with the real
 * `getActiveOrgId` it reads and the real appContext reducer. The doubles are
 * the Supabase RPC (network) and the store singleton's `_sync.boot` (warm-cache
 * hydration, an external engine). The boot-answer gate
 * (`orgBootstrapGate`) is the REAL module, driven from the test the way the
 * boot path drives it, because whether `ensureOrgId` joins it is part of the
 * contract under test (2026-09-17: a cold session must not be refused before
 * anyone has looked).
 *
 * THE LAW (common-docs/policies/context-is-carried-never-rebuilt.md): the
 * organization a write acts in is the one the user SELECTED. Nothing below the
 * boundary invents, defaults or substitutes it (2026-09-17). These tests pin the two
 * halves that matter: the selected organization wins, and a missing selection
 * REFUSES with the typed error every surface already renders, having touched no
 * network at all.
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

import appContextReducer, {
  setFullContext,
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";

interface RpcResult {
  data: string | null;
  error: { message: string } | null;
}
const rpc = jest.fn<(fn: string) => Promise<RpcResult>>();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (fn: string) => rpc(fn) },
}));

function makeAppContextStore() {
  return configureStore({ reducer: { appContext: appContextReducer } });
}

let store = makeAppContextStore();
const boot = jest.fn<() => Promise<void>>();

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => store.getState(),
    dispatch: store.dispatch,
    _sync: { boot },
  }),
}));

import { ensureOrgId } from "../ensureOrgId";
import { getActiveOrgId, requireSelectedOrgId } from "../activeOrg";
import {
  markOrgBootstrapResolved,
  resetOrgBootstrapGate,
} from "../orgBootstrapGate";

const SELECTED = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

describe("ensureOrgId", () => {
  beforeEach(() => {
    store = makeAppContextStore();
    rpc.mockReset();
    boot.mockReset();
    boot.mockResolvedValue(undefined);
    // The boot path has ANSWERED the organization question (with or without an
    // organization) — the state every case below except the last one is in.
    // Leaving the gate unanswered would make `ensureOrgId` correctly wait, and
    // a wait is not what those cases are pinning.
    resetOrgBootstrapGate();
    markOrgBootstrapResolved();
  });

  // Break caught: any resolver choosing an org over the caller's explicit one.
  it("returns the caller's explicit org even when Redux holds a different selected org", async () => {
    store.dispatch(setFullContext({ organization_id: OTHER }));

    await expect(ensureOrgId(SELECTED)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
  });

  // Break caught: any default outranking the org the user selected.
  it("uses the SELECTED org, with no RPC", async () => {
    store.dispatch(setFullContext({ organization_id: SELECTED }));

    await expect(ensureOrgId(undefined)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
  });

  // THE LAW. Break caught: a fallback organization coming back in any form —
  // from Redux, from a cache, or from an RPC.
  it("REFUSES when nothing is selected, even though an RPC would answer", async () => {
    rpc.mockResolvedValue({ data: OTHER, error: null });

    await expect(ensureOrgId(undefined)).rejects.toBeInstanceOf(
      OrganizationContextError,
    );
    // Nothing was written, and nothing was even asked of the network.
    expect(rpc).not.toHaveBeenCalled();
    expect(store.getState().appContext.organization_id).toBeNull();
  });

  // Break caught: refusing with a shape the screens cannot recognise, so the
  // user sees a raw transport sentence instead of the picker.
  it("refuses with the error every surface already renders, carrying the remedy", async () => {
    let caught: unknown;
    try {
      await ensureOrgId(null);
    } catch (err) {
      caught = err;
    }

    expect(isOrganizationRequiredError(caught)).toBe(true);
    expect((caught as Error).message).toBe(
      "You don't belong to an organization yet. Create one to continue.",
    );
  });

  // Break caught: not AWAITING hydration. Boot selects the org only after an
  // async hop; a resolver that does not wait would refuse a legitimate write.
  it("never sends on a PAINTED cache — it waits for the ladder, and the account's answer wins", async () => {
    resetOrgBootstrapGate(); // a fresh load: the ladder has not answered
    // The browser cache paints the organization this browser last held…
    store.dispatch(
      buildRehydrateAction("appContext", { organization_id: OTHER, organization_name: "Old" }, { fromRehydrate: true }),
    );
    expect(store.getState().appContext.organization_id).toBe(OTHER);
    let answer: unknown;
    const pending = ensureOrgId(undefined).then(
      (id) => (answer = id),
      (err) => (answer = err),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(answer).toBeUndefined(); // nothing left on the painted value

    // …then the ladder answers from the account (last active elsewhere).
    store.dispatch(
      buildRehydrateAction(
        "appContext",
        { organization_id: SELECTED, organization_name: "New", orgBootstrapResolved: true, orgBootstrapFailure: null },
        { fromRehydrate: true },
      ),
    );
    markOrgBootstrapResolved();
    await pending;
    expect(answer).toBe(SELECTED);
    expect(store.getState().appContext.organization_id).toBe(SELECTED);
  });

  it("a tab that HOLDS an organization keeps it when a later ladder answer differs", async () => {
    store.dispatch(setOrganization({ id: SELECTED, name: "Mine" }));
    store.dispatch(
      buildRehydrateAction(
        "appContext",
        { organization_id: OTHER, organization_name: "Elsewhere", orgBootstrapResolved: true, orgBootstrapFailure: null },
        { fromRehydrate: true },
      ),
    );
    await expect(ensureOrgId(undefined)).resolves.toBe(SELECTED);
  });

  it("waits for the boot path's answer before refusing on a cold session", async () => {
    resetOrgBootstrapGate(); // nobody has answered yet
    let refusalOrId: unknown;
    const pending = ensureOrgId(undefined).then(
      (id) => (refusalOrId = id),
      (err) => (refusalOrId = err),
    );

    // Give every microtask (and the awaited warm-cache boot) a chance to run:
    // a resolver that did not wait for the gate has already refused by now.
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(refusalOrId).toBeUndefined();

    store.dispatch(setOrganization({ id: SELECTED }));
    markOrgBootstrapResolved();
    await pending;

    expect(refusalOrId).toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("getActiveOrgId", () => {
  beforeEach(() => {
    store = makeAppContextStore();
  });

  // Break caught: any fallback rung returning. This read is the one every
  // service callsite and `ensureOrgId` sit on, so a fallback here re-opens the
  // whole class in one line.
  it("is null when nothing is selected", () => {

    expect(getActiveOrgId()).toBeNull();
    expect(() => requireSelectedOrgId()).toThrow(OrganizationContextError);
  });

  it("returns the selected organization", () => {
    store.dispatch(setFullContext({ organization_id: SELECTED }));

    expect(getActiveOrgId()).toBe(SELECTED);
    expect(requireSelectedOrgId()).toBe(SELECTED);
  });
});
