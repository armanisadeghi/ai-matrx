/**
 * activeOrgCookieMiddleware.test.ts — the shared apex cookie is written on
 * every REAL change of the active organization, keyed by the signed-in user,
 * and never on an echo, never without an identity, never cleared by a UI
 * reset. (2026-09-08: Studio was refused for a person this app had remembered
 * for weeks — the memory was per-origin. The cookie is the cross-origin one.)
 */

import { jest } from "@jest/globals";

const write = jest.fn();
const clear = jest.fn();
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: {
    write: (...args: unknown[]) => write(...args),
    clear: (...args: unknown[]) => clear(...args),
    read: () => null,
  },
}));

import { activeOrgCookieMiddleware } from "@/lib/organizations/activeOrgCookieMiddleware";
import { REHYDRATE_ACTION_TYPE } from "@/lib/sync/engine/rehydrate";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type State = {
  appContext: { organization_id: string | null };
  userAuth: { id: string | null };
};

/** Run one action through the middleware with a before → after state swap. */
function run(before: State, after: State, type: string) {
  let state = before;
  const storeApi = {
    getState: () => state,
    dispatch: jest.fn(),
  } as unknown as Parameters<typeof activeOrgCookieMiddleware>[0];
  const next = jest.fn((action: unknown) => {
    state = after;
    return action;
  });
  return activeOrgCookieMiddleware(storeApi)(next)({ type });
}

beforeEach(() => {
  write.mockReset();
  clear.mockReset();
});

describe("activeOrgCookieMiddleware", () => {
  it("writes the cookie, keyed by the signed-in user, when the org really changes", () => {
    run(
      { appContext: { organization_id: ORG_A }, userAuth: { id: USER } },
      { appContext: { organization_id: ORG_B }, userAuth: { id: USER } },
      "appContext/setOrganization",
    );
    expect(write).toHaveBeenCalledWith({ userId: USER, organizationId: ORG_B });
  });

  it("writes on a cache restore too (null → org), so existing users seed the cookie on their next boot", () => {
    run(
      { appContext: { organization_id: null }, userAuth: { id: USER } },
      { appContext: { organization_id: ORG_A }, userAuth: { id: USER } },
      REHYDRATE_ACTION_TYPE,
    );
    expect(write).toHaveBeenCalledWith({ userId: USER, organizationId: ORG_A });
  });

  it("does NOT rewrite on an echo (same id) — cross-tab broadcasts and rehydrates carry the id the store already holds", () => {
    run(
      { appContext: { organization_id: ORG_A }, userAuth: { id: USER } },
      { appContext: { organization_id: ORG_A }, userAuth: { id: USER } },
      "appContext/setOrganization",
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("does NOT write without an identity — a keyless cookie would leak to the next person", () => {
    run(
      { appContext: { organization_id: null }, userAuth: { id: null } },
      { appContext: { organization_id: ORG_A }, userAuth: { id: null } },
      "appContext/setOrganization",
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("does NOT clear on a null transition — clearContext also serves UI resets; sign-out clears explicitly", () => {
    run(
      { appContext: { organization_id: ORG_A }, userAuth: { id: USER } },
      { appContext: { organization_id: null }, userAuth: { id: USER } },
      "appContext/clearContext",
    );
    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("ignores unrelated actions without reading state", () => {
    const getState = jest.fn();
    const next = jest.fn((a: unknown) => a);
    activeOrgCookieMiddleware(
      { getState, dispatch: jest.fn() } as unknown as Parameters<typeof activeOrgCookieMiddleware>[0],
    )(next)({ type: "notes/edit" });
    expect(getState).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
