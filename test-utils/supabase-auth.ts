/**
 * The ONE fake `auth` for a fake Supabase client in tests.
 *
 * Server code resolves the caller with `getClaimsUser(client)`
 * (`utils/supabase/resolveUser.ts`), which calls `client.auth.getClaims()` —
 * NOT `client.auth.getUser()`. Every hand-rolled fake client in this repo was
 * written against `getUser`, so the day the routes moved
 * (e86a0d70ef, "API routes stop making an auth-server round trip per
 * request") fifteen suites died with
 * `TypeError: client.auth.getClaims is not a function`.
 *
 * `withClaims` closes that class at the source: wrap the fake `auth` object a
 * test already builds and it gains a `getClaims` DERIVED FROM THE SAME
 * `getUser` — one fake user, two doors that can never disagree. Side effects
 * inside the fake `getUser` (the middleware suite records the cookies it saw)
 * and every other method on the object (`getSession`, `signOut`,
 * `signInWithPassword`) are preserved.
 *
 *     createClientMock.mockResolvedValue({
 *       auth: withClaims({ getUser: async () => ({ data: { user } }) }),
 *     });
 *
 * 🚨 `resolveUser.ts` deliberately has NO `getUser` fallback when `getClaims`
 * is missing: a real Supabase client always has it, and a fallback would hide
 * exactly this mock gap instead of failing loudly.
 *
 * Envelope, matching supabase-js:
 *  - a fake user       → `{ data: { claims }, error: null }`
 *  - no user / no session → `{ data: null, error: null }`
 *    (`getClaimsUser` reads that as SETTLED signed out: `user` null, `error`
 *    null — signed out is an answer, not a verification failure)
 *  - the fake's own error → `{ data: null, error }`
 */

/** A fake `auth` object — the only thing this wrapper needs is `getUser`. */
type FakeAuthWithGetUser = {
  getUser: (...args: never[]) => Promise<{
    data?: { user?: Record<string, unknown> | null } | null;
    error?: unknown;
  }>;
};

/** The JWT claims a real access token carries for that user. */
export function claimsFromUser(user: Record<string, unknown>): Record<string, unknown> {
  const { id, ...rest } = user as { id?: unknown } & Record<string, unknown>;
  return {
    // A JWT has `sub`, never `id` — `userFromClaims` restates it as `id`.
    ...rest,
    sub: id,
    aud: (user.aud as string) ?? "authenticated",
    role: (user.role as string) ?? "authenticated",
    app_metadata: user.app_metadata ?? {},
    user_metadata: user.user_metadata ?? {},
  };
}

export function withClaims<T extends FakeAuthWithGetUser>(auth: T) {
  return {
    ...auth,
    getClaims: async (_jwt?: string) => {
      const { data, error } = await auth.getUser(...([] as never[]));
      if (error) return { data: null, error };
      const user = data?.user;
      if (!user) return { data: null, error: null };
      return { data: { claims: claimsFromUser(user) }, error: null };
    },
  };
}
