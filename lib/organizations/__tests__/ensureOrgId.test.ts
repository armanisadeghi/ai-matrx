/**
 * ensureOrgId.test.ts — the org-resolution contract for org-scoped writes.
 *
 * Regression for the 2026-08-17 incident: an appContext with no org made every
 * write take the loud personal-org RPC fallback, and because the fallback only
 * RETURNED an id (it never repaired the hole), the very next write screamed
 * again. Recovery that does not repair fires forever.
 */

import { jest } from "@jest/globals";

interface RpcResult {
  data: string | null;
  error: { message: string } | null;
}
const rpc = jest.fn<(...args: unknown[]) => Promise<RpcResult>>();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

const PERSONAL = "11111111-1111-1111-1111-111111111111";
const SELECTED = "22222222-2222-2222-2222-222222222222";

type AppContext = {
  organization_id: string | null;
  personal_organization_id: string | null;
};

let state: { appContext: AppContext };
const dispatch = jest.fn((action: { type: string; payload: unknown }) => {
  if (action.type === "appContext/setPersonalOrganization") {
    state.appContext.personal_organization_id = action.payload as string;
  }
  return action;
});

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => state, dispatch }),
}));

// The real slice is heavy (sync policy graph); the repair only needs the
// action creator's shape, and the type is asserted by the real import in app code.
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  setPersonalOrganization: (id: string) => ({
    type: "appContext/setPersonalOrganization",
    payload: id,
  }),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

import { ensureOrgId, clearPersonalOrgIdCache } from "../personalOrg";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

describe("ensureOrgId", () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    clearPersonalOrgIdCache();
    rpc.mockReset();
    dispatch.mockClear();
    (captureError as jest.Mock).mockClear();
    state = { appContext: { organization_id: null, personal_organization_id: null } };
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("uses the explicit org and touches nothing else", async () => {
    await expect(ensureOrgId(SELECTED)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("uses the active org from Redux with no RPC and no scream", async () => {
    state.appContext.organization_id = SELECTED;
    await expect(ensureOrgId(undefined)).resolves.toBe(SELECTED);
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("falls back to the personal org from Redux without the RPC", async () => {
    state.appContext.personal_organization_id = PERSONAL;
    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(rpc).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("screams AND repairs Redux when no org is present, so later writes are clean", async () => {
    rpc.mockResolvedValue({ data: PERSONAL, error: null });

    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "appContext/setPersonalOrganization",
      payload: PERSONAL,
    });

    // The hole is repaired: the second write neither screams nor re-RPCs.
    await expect(ensureOrgId(undefined)).resolves.toBe(PERSONAL);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("never overwrites an explicitly selected org while repairing", async () => {
    rpc.mockResolvedValue({ data: PERSONAL, error: null });
    await ensureOrgId(undefined);
    expect(state.appContext.organization_id).toBeNull();
    expect(state.appContext.personal_organization_id).toBe(PERSONAL);
  });
});
