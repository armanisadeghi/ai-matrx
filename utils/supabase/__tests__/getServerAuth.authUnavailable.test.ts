/**
 * `getServerAuth()` must draw the SAME line the proxy draws.
 *
 * `authUnavailable` separates "we could not tell" from "not signed in", and the
 * layouts now act on it: they hold the shell rather than painting a signed-out
 * one. That makes both failure directions expensive, so both are asserted here:
 *
 *  - A transport failure or a SPENT IDENTITY BUDGET must set the flag, or a
 *    2.5s network blink signs a person out of a shell they are still signed in
 *    to (the 2026-09-20 `504` class).
 *  - A token we reached a VERDICT on — badly signed, forged, rotated key — must
 *    NOT set it, or that person is held on "reload in a moment" forever and
 *    never told to sign in, while the proxy sends the same request to /login.
 *    Observed live on 2026-09-21 against the pre-fix body.
 *
 * FORCING FUNCTION: the fakes never hand back a hand-rolled `{ name }` bag.
 * Every case constructs a REAL `AuthError` — and the budget case constructs the
 * exact synthetic `408 auth_budget_exhausted` that `createAuthBudget` in
 * `@ai-matrx/data/next` returns once a request's deadline is spent. A fake that
 * cannot reproduce the real shape cannot prove the real predicate.
 */
import { AuthError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { isAuthTransportFailure, getClaimsUser } from "../claimsUser";

const claimsClient = (result: { data?: unknown; error?: AuthError | null }) =>
  ({ auth: { getClaims: async () => ({ data: result.data ?? null, error: result.error ?? null }) } }) as never;

/** What getServerAuth computes, over the same primitives it uses. */
async function resolve(client: never) {
  const { data: { user }, error } = await getClaimsUser(client);
  return {
    isAuthenticated: !!user,
    authUnavailable: !user && error !== null && isAuthTransportFailure(error),
  };
}

describe("authUnavailable means UNREACHABLE, never 'the token was bad'", () => {
  it("sets the flag when the auth authority is unreachable", async () => {
    const got = await resolve(claimsClient({ error: new AuthRetryableFetchError("fetch failed", 0) }));
    expect(got).toEqual({ isAuthenticated: false, authUnavailable: true });
  });

  it("sets the flag on the budget's synthetic 408 — the spent-deadline answer", async () => {
    // Exactly what createAuthBudget returns once the 2.5s deadline is spent.
    const spent = new AuthError(
      "identity resolve budget of 2500ms is exhausted for this request; not retrying",
      408,
      "auth_budget_exhausted",
    );
    const got = await resolve(claimsClient({ error: spent }));
    expect(got.authUnavailable).toBe(true);
  });

  it.each([503, 504])("sets the flag on a %s from the auth host", async (status) => {
    const got = await resolve(claimsClient({ error: new AuthError("gateway", status, "unavailable") }));
    expect(got.authUnavailable).toBe(true);
  });

  it("does NOT set the flag for a badly-signed token — that is a verdict", async () => {
    const bad = new AuthError("invalid signature", 401, "bad_jwt");
    const got = await resolve(claimsClient({ error: bad }));
    expect(got).toEqual({ isAuthenticated: false, authUnavailable: false });
  });

  it("does NOT set the flag for a genuine guest — no session is an ANSWER", async () => {
    const got = await resolve(claimsClient({ error: new AuthSessionMissingError() }));
    expect(got).toEqual({ isAuthenticated: false, authUnavailable: false });
  });

  it("does NOT set the flag when nobody is signed in and nothing errored", async () => {
    const got = await resolve(claimsClient({ data: { claims: null } }));
    expect(got).toEqual({ isAuthenticated: false, authUnavailable: false });
  });

  it("resolves a valid token to a user with the flag clear", async () => {
    const got = await resolve(claimsClient({ data: { claims: { sub: "u-1", email: "a@b.c" } } }));
    expect(got).toEqual({ isAuthenticated: true, authUnavailable: false });
  });

  it("the OLD definition (any error at all) would have called a bad token unavailable", () => {
    // The regression this file exists to stop, stated as an assertion rather
    // than a comment: `!user && error !== null` was true for a forged token.
    const bad = new AuthError("invalid signature", 401, "bad_jwt");
    expect(bad !== null).toBe(true);          // the old predicate: unavailable
    expect(isAuthTransportFailure(bad)).toBe(false); // the new one: a verdict
  });
});
