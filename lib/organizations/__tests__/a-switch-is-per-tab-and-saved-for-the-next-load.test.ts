/**
 * A SWITCH MOVES THIS TAB AND IS SAVED FOR THE NEXT LOAD (active-organization
 * plan, 2026-10-07).
 *
 *   - `chooseActiveOrganization` sets this tab's organization and writes the
 *     account's last active organization through the ONE door
 *     (`users.set_last_active_organization`); it never sets none.
 *   - `appContextPolicy` broadcasts nothing: another open tab never moves.
 *   - a not-a-member refusal from the server is recognised and re-runs the
 *     ladder once per burst.
 *
 * SUT: the real thunk, slice, policy and refusal recogniser. Doubles: the
 * account write door (network) and the toast.
 */
import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

const writes: string[] = [];
let writeFails = false;
jest.mock("@/lib/organizations/accountOrganizationChoices", () => ({
  writeLastActiveOrganization: async (id: string) => {
    writes.push(id);
    if (writeFails) throw new Error("refused");
  },
  readAccountOrganizationChoices: async () => ({
    lastActiveOrganizationId: null,
    startupOrganizationId: null,
  }),
}));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (m: string) => toastError(m), info: () => {} },
}));

import appContextReducer, { appContextPolicy } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import {
  isOrgBootstrapResolved,
  resetOrgBootstrapGate,
} from "@/lib/organizations/orgBootstrapGate";
import {
  isNotAMemberRefusal,
  noticeNotAMemberRefusal,
  resetNotAMemberRefusalGap,
} from "@/lib/organizations/organizationRefusal";

const CLINIC = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

function makeStore() {
  return configureStore({ reducer: { appContext: appContextReducer } });
}

beforeEach(() => {
  writes.length = 0;
  writeFails = false;
  toastError.mockReset();
  resetOrgBootstrapGate();
  resetNotAMemberRefusalGap();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a switch", () => {
  it("moves this tab, answers the ladder for it, and saves last active", async () => {
    const store = makeStore();
    store.dispatch(chooseActiveOrganization({ id: CLINIC, name: "Cedar Ridge" }) as never);
    await flush();
    expect(store.getState().appContext.organization_id).toBe(CLINIC);
    expect(store.getState().appContext.orgBootstrapResolved).toBe(true);
    expect(isOrgBootstrapResolved()).toBe(true);
    expect(writes).toEqual([CLINIC]);
  });

  it("never sets none", async () => {
    const store = makeStore();
    store.dispatch(chooseActiveOrganization({ id: CLINIC }) as never);
    store.dispatch(chooseActiveOrganization({ id: null }) as never);
    await flush();
    expect(store.getState().appContext.organization_id).toBe(CLINIC);
    expect(writes).toEqual([CLINIC]);
  });

  it("says so when the save is refused", async () => {
    writeFails = true;
    const store = makeStore();
    store.dispatch(chooseActiveOrganization({ id: CLINIC }) as never);
    await flush();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

describe("per tab", () => {
  it("the active organization policy broadcasts nothing to other tabs", () => {
    expect(appContextPolicy.config.perTab).toBe(true);
    expect(appContextPolicy.broadcastActions.size).toBe(0);
  });

  it("a cached record never satisfies the load — every load asks the account", () => {
    const satisfies = appContextPolicy.config.remote?.cacheSatisfies;
    expect(
      satisfies?.({ organization_id: CLINIC, organization_name: "Cedar Ridge" } as never),
    ).toBe(false);
  });
});

describe("a not-a-member refusal", () => {
  it("is recognised in both envelope shapes, and nothing else is", () => {
    expect(isNotAMemberRefusal({ code: "organization_forbidden" })).toBe(true);
    expect(isNotAMemberRefusal({ detail: { code: "organization_not_member" } })).toBe(true);
    expect(isNotAMemberRefusal({ code: "organization_required" })).toBe(false);
    expect(isNotAMemberRefusal(null)).toBe(false);
  });

  it("re-runs the ladder once per burst", () => {
    const recheck = jest.fn();
    const body = { detail: { code: "organization_forbidden" } };
    expect(noticeNotAMemberRefusal(body, recheck, 1_000)).toBe(true);
    expect(noticeNotAMemberRefusal(body, recheck, 2_000)).toBe(false);
    expect(noticeNotAMemberRefusal(body, recheck, 40_000)).toBe(true);
    expect(recheck).toHaveBeenCalledTimes(2);
  });
});
