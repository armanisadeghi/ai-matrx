/**
 * @jest-environment node
 */
/**
 * utils/supabase/webDb.ts — the gate every client-side marketing/CMS data
 * service passes before it may query the `web` schema.
 *
 * What it OWNS: validating the JWT (`getClaims`) BEFORE trusting the stored
 * session; refusing with `WebAuthenticationRequiredError` (and the underlying
 * cause) on every unusable claims or session outcome, so a hydration race never
 * reaches PostgREST as an anonymous request; and handing back a builder bound to
 * the `web` profile only after both checks pass.
 *
 * The Supabase client is REAL (supabase-js). The auth server is the external
 * dependency, so `auth.getClaims` / `auth.getSession` are spied with complete,
 * typed results. The builder's schema binding is proven by the request it
 * actually emits through a recording fetch — not by a mocked `schema()` call.
 */
import {
  AuthError,
  createClient,
  type Session,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
  WebAuthenticationRequiredError,
} from "@/utils/supabase/webDb";

const USER_ID = "5b0e2f8c-7a1d-4c3e-9f6b-2d8a4e1c7b39";
const VERIFY_FAILED =
  "Your sign-in session could not be verified. Refresh and try again.";
const SIGN_IN_FIRST = "Sign in before loading marketing data.";

interface RecordedRequest {
  method: string;
  path: string;
  profile: string | null;
}
const requests: RecordedRequest[] = [];

function realClient() {
  return createClient<Database>("http://localhost:54321", "sb_publishable_test", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const url = new URL(
          input instanceof URL
            ? input.href
            : typeof input === "string"
              ? input
              : input.url,
        );
        const headers = new Headers(init?.headers);
        requests.push({
          method: init?.method ?? "GET",
          path: decodeURIComponent(url.pathname + url.search),
          profile:
            headers.get("accept-profile") ?? headers.get("content-profile"),
        });
        return new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
}

type WebClient = ReturnType<typeof realClient>;
type ClaimsResult = Awaited<ReturnType<WebClient["auth"]["getClaims"]>>;
type SessionResult = Awaited<ReturnType<WebClient["auth"]["getSession"]>>;
type Outcome<T> = { kind: "resolve"; value: T } | { kind: "reject"; error: Error };

const signedInSession = {
  access_token: "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature",
  refresh_token: "v1.refresh-token",
  expires_in: 3600,
  expires_at: 1_900_000_000,
  token_type: "bearer",
  user: {
    id: USER_ID,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-09-01T00:00:00.000Z",
  },
} satisfies Session;

const verifiedClaims: ClaimsResult = {
  data: {
    claims: {
      iss: "http://localhost:54321/auth/v1",
      sub: USER_ID,
      aud: "authenticated",
      exp: 1_900_000_000,
      iat: 1_899_996_400,
      role: "authenticated",
      aal: "aal1",
      session_id: "8e2c4a6b-1f3d-4e5a-9b7c-0d1e2f3a4b5c",
    },
    header: { alg: "ES256", kid: "signing-key-1", typ: "JWT" },
    signature: new Uint8Array([7, 7, 7]),
  },
  error: null,
};

const liveSession: SessionResult = {
  data: { session: signedInSession },
  error: null,
};

function arrange(
  claims: Outcome<ClaimsResult>,
  session: Outcome<SessionResult>,
) {
  const client = realClient();
  const getClaims = jest.spyOn(client.auth, "getClaims");
  if (claims.kind === "resolve") getClaims.mockResolvedValue(claims.value);
  else getClaims.mockRejectedValue(claims.error);
  const getSession = jest.spyOn(client.auth, "getSession");
  if (session.kind === "resolve") getSession.mockResolvedValue(session.value);
  else getSession.mockRejectedValue(session.error);
  return { client, getClaims, getSession };
}

beforeEach(() => {
  requests.length = 0;
});

describe("authenticatedWebDb", () => {
  it("binds the query builder to the web profile only after the JWT and then the session verify", async () => {
    const { client, getClaims, getSession } = arrange(
      { kind: "resolve", value: verifiedClaims },
      { kind: "resolve", value: liveSession },
    );

    const db = await authenticatedWebDb(client);

    // The JWT is validated before the (possibly stale) stored session is read.
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(
      getSession.mock.invocationCallOrder[0],
    );
    expect(requests).toEqual([]);

    await db.from("brand").select("id");

    expect(requests).toEqual([
      { method: "GET", path: "/rest/v1/brand?select=id", profile: "web" },
    ]);
  });

  it("hands back the verified session itself for non-web Supabase calls", async () => {
    const { client } = arrange(
      { kind: "resolve", value: verifiedClaims },
      { kind: "resolve", value: liveSession },
    );

    await expect(requireAuthenticatedSupabaseSession(client)).resolves.toBe(
      signedInSession,
    );
  });

  const claimsRejected = new AuthError("JWT expired", 401, "bad_jwt");
  const claimsUnreachable = new Error("claim validation unavailable");
  const sessionStorageFailed = new AuthError(
    "Session storage unavailable",
    500,
    "unexpected_failure",
  );
  const sessionReadThrew = new Error("session storage failed");

  it.each<{
    name: string;
    claims: Outcome<ClaimsResult>;
    session: Outcome<SessionResult>;
    message: string;
    cause: unknown;
    readsStoredSession: boolean;
  }>([
    {
      name: "the JWT is rejected",
      claims: { kind: "resolve", value: { data: null, error: claimsRejected } },
      session: { kind: "resolve", value: liveSession },
      message: VERIFY_FAILED,
      cause: claimsRejected,
      readsStoredSession: false,
    },
    {
      name: "JWT validation throws",
      claims: { kind: "reject", error: claimsUnreachable },
      session: { kind: "resolve", value: liveSession },
      message: VERIFY_FAILED,
      cause: claimsUnreachable,
      readsStoredSession: false,
    },
    {
      name: "validation returns no claims and no error",
      claims: { kind: "resolve", value: { data: null, error: null } },
      session: { kind: "resolve", value: liveSession },
      message: VERIFY_FAILED,
      cause: undefined,
      readsStoredSession: false,
    },
    {
      name: "the session read reports an error",
      claims: { kind: "resolve", value: verifiedClaims },
      session: {
        kind: "resolve",
        value: { data: { session: null }, error: sessionStorageFailed },
      },
      message: VERIFY_FAILED,
      cause: sessionStorageFailed,
      readsStoredSession: true,
    },
    {
      name: "the session read throws",
      claims: { kind: "resolve", value: verifiedClaims },
      session: { kind: "reject", error: sessionReadThrew },
      message: VERIFY_FAILED,
      cause: sessionReadThrew,
      readsStoredSession: true,
    },
    {
      name: "there is no session",
      claims: { kind: "resolve", value: verifiedClaims },
      session: { kind: "resolve", value: { data: { session: null }, error: null } },
      message: SIGN_IN_FIRST,
      cause: undefined,
      readsStoredSession: true,
    },
    {
      name: "the session carries no access token",
      claims: { kind: "resolve", value: verifiedClaims },
      session: {
        kind: "resolve",
        value: {
          data: { session: { ...signedInSession, access_token: "" } },
          error: null,
        },
      },
      message: SIGN_IN_FIRST,
      cause: undefined,
      readsStoredSession: true,
    },
  ])(
    "refuses when $name, before any web query exists",
    async ({ claims, session, message, cause, readsStoredSession }) => {
      const { client, getSession } = arrange(claims, session);

      const refusal = await authenticatedWebDb(client).then(
        () => null,
        (error: unknown) => error,
      );

      expect(refusal).toBeInstanceOf(WebAuthenticationRequiredError);
      expect(refusal).toMatchObject({
        name: "WebAuthenticationRequiredError",
        message,
      });
      expect(refusal instanceof Error ? refusal.cause : "not an Error").toBe(
        cause,
      );
      expect(getSession).toHaveBeenCalledTimes(readsStoredSession ? 1 : 0);
      expect(requests).toEqual([]);
    },
  );
});
