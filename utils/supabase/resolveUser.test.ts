/**
 * @jest-environment node
 */
/**
 * `getClaimsUser` — the one API-route door that resolves the caller from the
 * access token instead of an auth-server round trip.
 *
 * WHY THIS TEST EXISTS: 134 call sites across 104 `app/api/**` routes were
 * converted from `client.auth.getUser()` to this helper in one pass. That is
 * only safe because the envelope is IDENTICAL — `{ data: { user }, error }`,
 * with `AuthSessionMissingError` when there is no session, because a call site
 * that branches on `error` ALONE must behave exactly as it did before. These
 * cases are the proof of that claim, not a restatement of it.
 *
 * The Supabase client is REAL (supabase-js). The auth server is the external
 * dependency, so `auth.getClaims` is spied with complete, typed results.
 *
 * Equivalence against the LIVE project (admin@admin.com, ES256, 2026-09-20):
 * id / email / user_metadata / is_anonymous / app_metadata all matched
 * `getUser()` byte for byte; a token with a swapped `sub` was refused with
 * "Invalid JWT signature"; the warm call cost 0.5 ms against 167.9 ms.
 */
import {
  AuthError,
  AuthSessionMissingError,
  createClient,
  type JwtPayload,
} from "@supabase/supabase-js";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

const USER_ID = "87a6e699-3622-4869-8843-d0867456c0dd";

function client() {
  return createClient("https://db.matrxserver.com", "sb_publishable_test_key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A complete, verified claims set — the shape `getClaims()` hands back. */
function claims(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    iss: "https://db.matrxserver.com/auth/v1",
    sub: USER_ID,
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    role: "authenticated",
    aal: "aal1",
    session_id: "11111111-1111-1111-1111-111111111111",
    email: "admin@admin.com",
    is_anonymous: false,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Admin" },
    ...overrides,
  };
}

function spyClaims(sb: ReturnType<typeof client>, result: unknown) {
  return jest
    .spyOn(sb.auth, "getClaims")
    .mockResolvedValue(result as Awaited<ReturnType<typeof sb.auth.getClaims>>);
}

afterEach(() => jest.restoreAllMocks());

describe("getClaimsUser", () => {
  it("returns every field app/api actually reads, with `id` from `sub`", async () => {
    const sb = client();
    spyClaims(sb, { data: { claims: claims() }, error: null });

    const { data, error } = await getClaimsUser(sb);

    expect(error).toBeNull();
    // The per-field census over app/api found these reads and nothing else.
    expect(data.user?.id).toBe(USER_ID); // x207
    expect(data.user?.email).toBe("admin@admin.com"); // x58
    expect(data.user?.user_metadata).toEqual({ full_name: "Admin" }); // x22
    expect(data.user?.is_anonymous).toBe(false); // x2
    expect(data.user?.app_metadata).toEqual({ provider: "email", providers: ["email"] }); // x2
  });

  it("answers a missing session the way getUser() does, so an `error`-only branch still fires", async () => {
    const sb = client();
    // getClaims() reports "no session" as { data: null, error: null } — getUser()
    // reports it as AuthSessionMissingError. A route that checks `error` alone
    // would sail past a null user if this door passed the difference through.
    spyClaims(sb, { data: null, error: null });

    const { data, error } = await getClaimsUser(sb);

    expect(data.user).toBeNull();
    expect(error).toBeInstanceOf(AuthSessionMissingError);
  });

  it("passes a verification failure straight through as the error", async () => {
    const sb = client();
    const invalid = new AuthError("Invalid JWT signature", 401, "bad_jwt");
    spyClaims(sb, { data: null, error: invalid });

    const { data, error } = await getClaimsUser(sb);

    expect(data.user).toBeNull();
    expect(error).toBe(invalid);
  });

  it("refuses claims with no `sub` rather than inventing an id", async () => {
    const sb = client();
    spyClaims(sb, { data: { claims: { ...claims(), sub: undefined } }, error: null });

    const { data, error } = await getClaimsUser(sb);

    expect(data.user).toBeNull();
    expect(error).toBeInstanceOf(AuthSessionMissingError);
  });

  it("defaults app_metadata / user_metadata to {} so a reader never null-checks what getUser() always gave it", async () => {
    const sb = client();
    spyClaims(sb, {
      data: { claims: { ...claims(), app_metadata: undefined, user_metadata: undefined } },
      error: null,
    });

    const { data } = await getClaimsUser(sb);

    expect(data.user?.app_metadata).toEqual({});
    expect(data.user?.user_metadata).toEqual({});
  });

  it("forwards an explicit Bearer token instead of reading the cookie session", async () => {
    const sb = client();
    const spy = spyClaims(sb, { data: { claims: claims() }, error: null });

    await getClaimsUser(sb, "the-bearer-token");

    expect(spy).toHaveBeenCalledWith("the-bearer-token");
  });
});
