/**
 * activeOrgCookieMiddleware.test.ts — the shared apex cookie is written on
 * every REAL change of the active organization, keyed by the signed-in user,
 * and never on an echo, never without an identity, never cleared by a UI
 * reset. (2026-09-08: Studio was refused for a person this app had remembered
 * for weeks — the memory was per-origin. The cookie is the cross-origin one.)
 *
 * SUT: the middleware, run inside a real store with the real appContext and
 * userAuth reducers and real action creators. The only double is the cookie
 * writer (`document.cookie` via @ai-matrx/data/db) — its write IS the contract.
 */

import { jest } from "@jest/globals";
import { configureStore } from "@reduxjs/toolkit";

const write = jest.fn<(args: { userId: string; organizationId: string }) => void>();
const clear = jest.fn<() => void>();
jest.mock("@/lib/organizations/activeOrgCookie", () => ({
  activeOrgCookie: {
    write: (args: { userId: string; organizationId: string }) => write(args),
    clear: () => clear(),
    read: () => null,
  },
}));

import { activeOrgCookieMiddleware } from "@/lib/organizations/activeOrgCookieMiddleware";
import appContextReducer, {
  clearContext,
  resolveOrganizationForBlockedAction,
  setFullContext,
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { buildRehydrateAction } from "@/lib/sync/engine/rehydrate";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeStore(userId: string | null) {
  const store = configureStore({
    reducer: { appContext: appContextReducer, userAuth: userAuthReducer },
    middleware: (getDefault) => getDefault().concat(activeOrgCookieMiddleware),
  });
  store.dispatch(setUserAuth({ id: userId }));
  return store;
}

beforeEach(() => {
  write.mockReset();
  clear.mockReset();
});

describe("activeOrgCookieMiddleware", () => {
  it("writes the cookie, keyed by the signed-in user, when the org really changes", () => {
    const store = makeStore(USER);
    store.dispatch(setOrganization({ id: ORG_A }));
    write.mockReset();

    store.dispatch(setOrganization({ id: ORG_B }));

    expect(write.mock.calls).toEqual([[{ userId: USER, organizationId: ORG_B }]]);
  });

  it("writes on a cache restore too (null → org), so existing users seed the cookie on their next boot", () => {
    const store = makeStore(USER);

    store.dispatch(
      buildRehydrateAction(
        "appContext",
        { organization_id: ORG_A },
        { fromRehydrate: true },
      ),
    );

    expect(write.mock.calls).toEqual([[{ userId: USER, organizationId: ORG_A }]]);
  });

  // Breaks caught: an org-changing action type missing from the watched set —
  // a restored full context or the first-choice gate would never reach Studio.
  it.each([
    ["setFullContext", () => setFullContext({ organization_id: ORG_B })],
    ["resolveOrganizationForBlockedAction", () => resolveOrganizationForBlockedAction({ id: ORG_B })],
  ])("writes when %s changes the org", (_name, action) => {
    const store = makeStore(USER);

    store.dispatch(action());

    expect(write.mock.calls).toEqual([[{ userId: USER, organizationId: ORG_B }]]);
  });

  it("does NOT rewrite on an echo (same id) — cross-tab broadcasts and rehydrates carry the id the store already holds", () => {
    const store = makeStore(USER);
    store.dispatch(setOrganization({ id: ORG_A }));
    write.mockReset();

    store.dispatch(setOrganization({ id: ORG_A }));

    expect(write).not.toHaveBeenCalled();
  });

  it("does NOT write without an identity — a keyless cookie would leak to the next person", () => {
    const store = makeStore(null);

    store.dispatch(setOrganization({ id: ORG_A }));

    expect(store.getState().appContext.organization_id).toBe(ORG_A);
    expect(write).not.toHaveBeenCalled();
  });

  it("does NOT clear on a null transition — clearContext also serves UI resets; sign-out clears explicitly", () => {
    const store = makeStore(USER);
    store.dispatch(setOrganization({ id: ORG_A }));
    write.mockReset();

    store.dispatch(clearContext());

    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  // Break caught: a refused cookie write (malformed id) throwing into the
  // dispatch chain — the Redux org switch must still land.
  it("keeps the org switch when the cookie writer refuses, and says so", () => {
    const store = makeStore(USER);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    write.mockImplementation(() => {
      throw new Error("organizationId must be a UUID");
    });
    try {
      expect(() => store.dispatch(setOrganization({ id: ORG_B }))).not.toThrow();
      expect(store.getState().appContext.organization_id).toBe(ORG_B);
      expect(warn).toHaveBeenCalledWith(
        "[activeOrgCookie] could not mirror the active org",
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
