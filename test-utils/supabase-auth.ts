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

/**
 * A fake `auth` object — the only thing this wrapper needs is ONE of
 * `getUser` or `getSession`.
 *
 * 🚨 `getSession` is here for the SECOND half of the same class (2026-09-21).
 * The browser-side readers moved to `getClaimsUser(client)` too, and the
 * eleven suites that fake `@/utils/supabase/client` were all written against
 * `auth.getSession()` — `{ data: { session: { user } } }` — so they died with
 * the identical `client.auth.getClaims is not a function`. Deriving the claims
 * from the SAME `getSession` the suite already controls keeps the one-fake-user
 * rule: a test that hands back a null session is still signed out at BOTH
 * doors, and one that hands back a session user is that user at both.
 *
 * The index signature is load-bearing: a suite's fake usually carries
 * `getSession`, `signOut` and friends alongside `getUser`, and without it
 * TypeScript's excess-property check rejects that object literal at the
 * `withClaims({ ... })` call even though the wrapper preserves every one of
 * those methods.
 */
type FakeUserEnvelope = Promise<{
  data?: { user?: Record<string, unknown> | null } | null;
  error?: unknown;
}>;
type FakeSessionEnvelope = Promise<{
  data?: {
    session?: { user?: Record<string, unknown> | null } | null;
  } | null;
  error?: unknown;
}>;

type FakeAuthWithGetUser = {
  getUser: (...args: never[]) => FakeUserEnvelope;
  [otherMethod: string]: unknown;
};

type FakeAuthWithGetSession = {
  getSession: (...args: never[]) => FakeSessionEnvelope;
  [otherMethod: string]: unknown;
};

type FakeAuth = FakeAuthWithGetUser | FakeAuthWithGetSession;

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

export function withClaims<T extends FakeAuth>(auth: T) {
  return {
    ...auth,
    getClaims: async (_jwt?: string) => {
      // `getUser` wins when a fake has both (it is the narrower, verified
      // door); otherwise the session's own user is the fake's one identity.
      const fake = auth as Partial<FakeAuthWithGetUser> &
        Partial<FakeAuthWithGetSession>;
      if (typeof fake.getUser === "function") {
        const { data, error } = await fake.getUser(...([] as never[]));
        if (error) return { data: null, error };
        const user = data?.user;
        if (!user) return { data: null, error: null };
        return { data: { claims: claimsFromUser(user) }, error: null };
      }
      if (typeof fake.getSession === "function") {
        const { data, error } = await fake.getSession(...([] as never[]));
        if (error) return { data: null, error };
        const user = data?.session?.user;
        if (!user) return { data: null, error: null };
        return { data: { claims: claimsFromUser(user) }, error: null };
      }
      // Never silently answer "signed out" for a fake that declares neither
      // door — that would turn a mock gap into a passing test.
      throw new Error(
        "withClaims(): the fake `auth` declares neither getUser nor getSession, " +
          "so there is no identity to derive claims from.",
      );
    },
  };
}
