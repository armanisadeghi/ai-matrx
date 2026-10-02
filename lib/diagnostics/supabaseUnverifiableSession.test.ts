/**
 * A SESSION THE DATABASE CANNOT VERIFY — proven through the real wrapper.
 *
 * The bug (Arman, /marketing on the shared dev server, 2026-10-02): the browser
 * held a session minted by a different auth authority (live vs the nightly
 * clone). Every read came back 401 PGRST301, the session barrier re-resolved
 * the SAME foreign session, retried, was refused again — and logged
 * SESSION_BARRIER_RECOVERED "served… Nothing was lost". The page sat
 * half-working with the chat refusing to start.
 *
 * Drives `wrapClientForCapture` (the ONE proxy every browser read goes
 * through), like supabaseSessionBarrier.test.ts.
 */

import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { resetSessionBarrierForTests } from "@/utils/supabase/sessionBarrier";
import {
  UNVERIFIABLE_SESSION_NOTICE,
  isUnverifiableTokenError,
  isUnverifiableTokenRefusal,
  resetUnverifiableSessionForTests,
  unverifiableSessionLoginHref,
} from "@/utils/supabase/unverifiableSession";

const COOKIE = "sb-matrx-auth-v2";

/** What PostgREST answers a token signed by a key it does not hold. */
const REFUSED_UNVERIFIABLE = {
  data: null,
  error: { code: "PGRST301", message: "No suitable key or wrong key type" },
  status: 401,
} as const;

const REFUSED_NO_IDENTITY = {
  data: null,
  error: { code: "42501", message: "permission denied for table kind_component" },
  status: 401,
} as const;

/** GoTrue's answer to `getUser` for a token from another project. */
const BAD_JWT = {
  name: "AuthApiError",
  status: 403,
  code: "bad_jwt",
  message:
    "invalid JWT: unable to parse or verify signature, token is unverifiable: error while executing keyfunc: unrecognized JWT kid",
};

function setAuthCookie(present: boolean): void {
  document.cookie = present
    ? `${COOKIE}=base64-session-payload; path=/`
    : `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function makeHarness(
  results: readonly unknown[],
  claimsError: Record<string, unknown> | null,
) {
  const queue = [...results];
  let executions = 0;
  const signOut = jest.fn(async (_opts: { scope: "local" }) => ({ error: null }));
  const getClaims = jest.fn(async () => ({
    data: claimsError ? null : { claims: { sub: "u1" } },
    error: claimsError,
  }));
  let listener: ((event: string, session: unknown) => void) | null = null;
  const builder = {
    then(onFulfilled: (value: unknown) => unknown) {
      executions += 1;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve(onFulfilled(next));
    },
  };
  const client = wrapClientForCapture({
    auth: {
      storageKey: COOKIE,
      // The foreign session is stored and unexpired: getSession hands it out.
      getSession: async () => ({ data: { session: { access_token: "jwt" } }, error: null }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getClaims,
      signOut,
    },
    from: (_relation: string) => builder,
    rpc: (_fn: string) => builder,
  });
  return {
    rpc: (fn: string) =>
      Promise.resolve(
        (client.rpc(fn) as { then: (cb: (v: unknown) => unknown) => unknown }).then((v) => v),
      ),
    attach: () => listener?.("SIGNED_IN", {}),
    executions: () => executions,
    signOut,
    getClaims,
  };
}

let navigations: string[] = [];

beforeEach(() => {
  clearCapturedErrors();
  resetSessionBarrierForTests();
  navigations = [];
  resetUnverifiableSessionForTests((href) => navigations.push(href));
  setAuthCookie(true);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setAuthCookie(false);
  jest.restoreAllMocks();
});

describe("a retry the database refuses again is never announced as served", () => {
  it("reports UNRECOVERED, not RECOVERED, when the replay is refused too", async () => {
    // getClaims says the token is fine, so this is the plain retry path.
    const h = makeHarness([REFUSED_NO_IDENTITY, REFUSED_NO_IDENTITY], null);
    h.attach();

    await expect(h.rpc("mbr_for_user")).resolves.toEqual(REFUSED_NO_IDENTITY);
    expect(h.executions()).toBe(2);

    const codes = getSnapshot().map((e) => e.code);
    expect(codes).not.toContain("SESSION_BARRIER_RECOVERED");
    expect(codes).toContain("SESSION_BARRIER_UNRECOVERED");
    const entry = getSnapshot().find((e) => e.code === "SESSION_BARRIER_UNRECOVERED");
    expect(entry?.message).toContain("refused again");
    expect(entry?.message).not.toContain("Nothing was lost");
  });

  it("still reports RECOVERED when the replay is actually served", async () => {
    const served = { data: [{ id: 1 }], error: null, status: 200 };
    const h = makeHarness([REFUSED_NO_IDENTITY, served], null);
    h.attach();

    await expect(h.rpc("mbr_for_user")).resolves.toEqual(served);
    expect(getSnapshot().map((e) => e.code)).toEqual(["SESSION_BARRIER_RECOVERED"]);
  });
});

describe("a token the auth authority cannot verify is ended, not retried", () => {
  it("signs this device out, records it, and sends the person to sign in", async () => {
    const h = makeHarness([REFUSED_UNVERIFIABLE], BAD_JWT);
    h.attach();

    await expect(h.rpc("mbr_for_user")).resolves.toEqual(REFUSED_UNVERIFIABLE);
    expect(h.executions()).toBe(1); // no pointless replay of a foreign token
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toMatch(/^\/login\?/);
    expect(new URLSearchParams(navigations[0].split("?")[1]).get("error")).toBe(
      UNVERIFIABLE_SESSION_NOTICE,
    );

    const codes = getSnapshot().map((e) => e.code);
    expect(codes).toContain("SESSION_UNVERIFIABLE");
    expect(codes).not.toContain("SESSION_BARRIER_RECOVERED");
  });

  it("ends the session once however many reads are refused", async () => {
    const h = makeHarness([REFUSED_UNVERIFIABLE], BAD_JWT);
    h.attach();
    await Promise.all([h.rpc("mbr_for_user"), h.rpc("ues_list"), h.rpc("inbox_counts")]);
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(navigations).toHaveLength(1);
  });

  it("never signs anyone out over an outage — it falls back to the one retry", async () => {
    const outage = { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" };
    const served = { data: [], error: null, status: 200 };
    const h = makeHarness([REFUSED_UNVERIFIABLE, served], outage);
    h.attach();

    await expect(h.rpc("mbr_for_user")).resolves.toEqual(served);
    expect(h.signOut).not.toHaveBeenCalled();
    expect(navigations).toHaveLength(0);
  });
});

describe("the classifiers", () => {
  it("reads PGRST301 at 401 as unverifiable, but not expiry or another status", () => {
    expect(isUnverifiableTokenRefusal(REFUSED_UNVERIFIABLE)).toBe(true);
    expect(
      isUnverifiableTokenRefusal({ status: 401, error: { code: "PGRST301", message: "JWT expired" } }),
    ).toBe(false);
    expect(isUnverifiableTokenRefusal({ status: 403, error: { code: "PGRST301" } })).toBe(false);
    expect(isUnverifiableTokenRefusal(REFUSED_NO_IDENTITY)).toBe(false);
  });

  it("reads only the authority's settled verdict as unverifiable", () => {
    expect(isUnverifiableTokenError(BAD_JWT)).toBe(true);
    expect(isUnverifiableTokenError({ name: "AuthInvalidJwtError", message: "Invalid JWT signature" })).toBe(true);
    expect(isUnverifiableTokenError({ name: "AuthInvalidJwtError", message: "JWT has expired" })).toBe(false);
    expect(isUnverifiableTokenError({ name: "AuthRetryableFetchError", status: 0 })).toBe(false);
    expect(isUnverifiableTokenError({ name: "AuthSessionMissingError", status: 400 })).toBe(false);
    expect(isUnverifiableTokenError({ status: 408, code: "auth_budget_exhausted" })).toBe(false);
    expect(isUnverifiableTokenError(null)).toBe(false);
  });

  it("keeps the page the person was on as the sign-in destination", () => {
    const href = unverifiableSessionLoginHref("/marketing", "?tab=plans");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/login?")).toBe(true);
    expect(params.get("redirectTo")).toBe("/marketing?tab=plans");
    expect(params.get("error")).toBe(UNVERIFIABLE_SESSION_NOTICE);
  });
});
