/**
 * ensureOrgId.test.ts — the org-resolution contract for org-scoped writes.
 *
 * SUT: `ensureOrgId` (lib/organizations/personalOrg.ts) together with the real
 * `getActiveOrgId` it reads and the real appContext reducer it repairs. The
 * doubles are the Supabase RPC (network) and the store singleton's
 * `_sync.boot` (warm-cache hydration, an external engine).
 *
 * LAW NOTE (2026-09-10): the emergency ruling "every write carries an explicit
 * organization_id; no resolver may choose one" (common-docs
 * projects/no-db-assigned-org/PLAN.md, task FE-T01, OPEN) condemns this
 * resolver's Redux/personal-org fallback. The tests marked TRANSITIONAL pin
 * the fallback's CURRENT loud-and-repairing behavior only until FE-T01 lands;
 * FE-T01 replaces them with "missing org rejects before Supabase". The
 * unmarked tests are the law's side of the contract and must survive FE-T01.
 *
 * Regression for the 2026-08-17 incident: an appContext with no org made every
 * write take the loud personal-org RPC fallback, and because the fallback only
 * RETURNED an id (it never repaired the hole), the very next write screamed
 * again. Recovery that does not repair fires forever.
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

import appContextReducer, {
  setFullContext,
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

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

import { ensureOrgId, clearPersonalOrgIdCache } from "../personalOrg";

const PERSONAL = "11111111-1111-1111-1111-111111111111";
const SELECTED = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";

const orgResolutionScreams = () =>
  getSnapshot().filter((entry) => entry.source === "org-resolution");

describe("ensureOrgId", () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    clearPersonalOrgIdCache();
    clearCapturedErrors();
    store = makeAppContextStore();
    rpc.mockReset();
    boot.mockReset();
    boot.mockResolvedValue(undefined);
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  // Break caught: any resolver choosing an org over the caller's explicit one.
  it("returns the caller's explicit org even when Redux holds a different selected and personal org", async () => {
    store.dispatch(
      setFullContext({ organization_id: OTHER, personal_organization_id: PERSONAL }),
    );

    await expect(ensureOrgId(SELECTED)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
    expect(orgResolutionScreams()).toHaveLength(0);
  });

  // Break caught: a personal-org default outranking the org the user selected.
  it("prefers the selected org over the personal org, with no RPC and no scream", async () => {
    store.dispatch(
      setFullContext({ organization_id: SELECTED, personal_organization_id: PERSONAL }),
    );

    await expect(ensureOrgId(undefined)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
    expect(orgResolutionScreams()).toHaveLength(0);
  });

  // TRANSITIONAL (FE-T01): personal-org fallback from Redux.
  it("falls back to the personal org from Redux without the RPC", async () => {
    store.dispatch(setFullContext({ personal_organization_id: PERSONAL }));

    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(rpc).not.toHaveBeenCalled();
    expect(orgResolutionScreams()).toHaveLength(0);
  });

  // Break caught: not AWAITING hydration. Boot selects the org only after an
  // async hop; a resolver that does not wait takes the personal-org RPC path.
  it("waits for warm-cache hydration before declaring org context missing", async () => {
    rpc.mockResolvedValue({ data: PERSONAL, error: null });
    boot.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      store.dispatch(setOrganization({ id: SELECTED }));
    });

    await expect(ensureOrgId(undefined)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
    expect(orgResolutionScreams()).toHaveLength(0);
  });

  // Break caught: accepting a missing org. The RPC answering with no org must
  // reject — never resolve null/empty into a write.
  it("rejects when the personal-org RPC returns no organization", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(ensureOrgId(undefined)).rejects.toThrow(
      "returned no personal organization",
    );
  });

  // TRANSITIONAL (FE-T01): loud fallback + Redux repair. Breaks caught: a
  // silent fallback (no scream) and a recovery that does not repair.
  it("screams once AND repairs Redux when no org is present, so later writes are clean", async () => {
    rpc.mockResolvedValue({ data: PERSONAL, error: null });

    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(orgResolutionScreams()).toHaveLength(1);
    // Repaired through the real reducer — personal org only; the selected org
    // is never invented.
    expect(store.getState().appContext.personal_organization_id).toBe(PERSONAL);
    expect(store.getState().appContext.organization_id).toBeNull();

    // The hole is repaired: the second write neither screams nor re-RPCs.
    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
