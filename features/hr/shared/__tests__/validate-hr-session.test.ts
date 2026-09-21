import { validateHrBrowserSession } from "../../service";
import { supabase } from "@/utils/supabase/client";
import { AuthError, AuthSessionMissingError } from "@supabase/auth-js";
import type { Session, User } from "@supabase/supabase-js";

// `validateHrBrowserSession` resolves identity with `getClaimsUser`, which calls
// `auth.getClaims()`. `withClaims` derives that door from the SAME fake
// `getUser` this suite already drives, so one fake user answers both and they
// can never disagree.
jest.mock("@/utils/supabase/client", () => {
  const { withClaims } = jest.requireActual<
    typeof import("@/test-utils/supabase-auth")
  >("@/test-utils/supabase-auth");
  return {
    supabase: {
      auth: withClaims({ getSession: jest.fn(), getUser: jest.fn() }),
    },
  };
});

const getSession = jest.mocked(supabase.auth.getSession);
const getUser = jest.mocked(supabase.auth.getUser);

const user: User = {
  id: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "person@example.com",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: "2026-08-27T00:00:00Z",
};

function session(accessToken: string): Session {
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1_788_000_000,
    refresh_token: "refresh-token",
    user,
  };
}

describe("validateHrBrowserSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    getUser.mockReset();
  });

  it("refuses before any HR RPC when the browser has no session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(validateHrBrowserSession()).resolves.toMatchObject({
      ok: false,
      kind: "denied",
      reason: "no_authenticated_session",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("refuses a locally cached session that server validation rejects", async () => {
    getSession.mockResolvedValue({
      data: { session: session("expired") },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    await expect(validateHrBrowserSession()).resolves.toMatchObject({
      ok: false,
      kind: "denied",
      reason: "no_authenticated_session",
    });
  });

  it("reports a FAILURE, never \"sign in again\", when the token could not be verified", async () => {
    getSession.mockResolvedValue({
      data: { session: session("valid") },
      error: null,
    });
    // Not an AuthSessionMissingError: the verification could not run at all.
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthError("JWKS fetch failed", 503, "unexpected_failure"),
    });

    await expect(validateHrBrowserSession()).resolves.toMatchObject({
      ok: false,
      kind: "failed",
    });
  });

  it("opens the HR context boundary only for a locally verified user", async () => {
    getSession.mockResolvedValue({
      data: { session: session("valid") },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user },
      error: null,
    });

    await expect(validateHrBrowserSession()).resolves.toEqual({
      ok: true,
      data: true,
    });
  });
});
