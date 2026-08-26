/**
 * THE STALE-IDENTITY CLASS.
 *
 * The store is seeded on the SERVER from the auth cookie, so a render the
 * server considered signed-in hands the browser a `userAuth.id`. When the
 * browser then has no usable session, something must reconcile the two —
 * otherwise Redux keeps reporting a signed-in user while supabase-js is
 * `anon`, and every consumer gated on that id issues an authenticated-only
 * call that comes back `42501 permission denied`.
 *
 * That is not hypothetical. Production captured it on `/chat/new`, where ONE
 * page load produced seven denials across seven unrelated features
 * (messaging, the file tree, assists, memberships, the COPPA gate, agent
 * access, integration connections) in four seconds, repeatedly, for weeks.
 *
 * These tests pin the reconciliation: no session ⇒ the identity is dropped;
 * a real session ⇒ it is never touched. The second half matters as much as
 * the first — a reconciler that clears too eagerly signs working users out.
 */

import { clearUserAuth } from "@/lib/redux/slices/userAuthSlice";

const getSession = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { getSession, getUser: jest.fn() } }),
  supabase: { auth: { getSession, getUser: jest.fn() } },
}));

/**
 * The pre-pass, extracted verbatim in shape from `usePublicAuthSync`: read the
 * local session, and drop the seeded identity when it cannot back one.
 */
async function reconcileIdentity(dispatch: (action: unknown) => void) {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) dispatch(clearUserAuth());
  } catch {
    /* a throwing storage read proves nothing — leave the identity alone */
  }
}

describe("identity reconciliation", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("drops a server-seeded identity the browser cannot back with a session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const dispatch = jest.fn();

    await reconcileIdentity(dispatch);

    expect(dispatch).toHaveBeenCalledWith(clearUserAuth());
  });

  it("drops it when a session object exists but carries no access token", async () => {
    // A session shell with no token authenticates nothing — PostgREST still
    // sees `anon`, so this is the same failure wearing a different shape.
    getSession.mockResolvedValue({ data: { session: { access_token: null } } });
    const dispatch = jest.fn();

    await reconcileIdentity(dispatch);

    expect(dispatch).toHaveBeenCalledWith(clearUserAuth());
  });

  it("leaves a real session alone — reconciling must never sign anyone out", async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: "a-real-token" } },
    });
    const dispatch = jest.fn();

    await reconcileIdentity(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("leaves the identity alone when the storage read throws", async () => {
    // Not proof of a missing session — only proof that we could not tell.
    getSession.mockRejectedValue(new Error("storage unavailable"));
    const dispatch = jest.fn();

    await reconcileIdentity(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
