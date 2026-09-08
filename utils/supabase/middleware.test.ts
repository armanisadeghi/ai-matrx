/** @jest-environment node */

import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME } from "./authCookie";
import { updateSession } from "./middleware";
import { GOOGLE_OAUTH_REDIRECT_STATE_COOKIE } from "@/providers/google-provider/oauthRedirect";

jest.mock("@supabase/ssr", () => ({
  ...jest.requireActual("@supabase/ssr"),
  createServerClient: jest.fn(),
}));

const mockedCreateServerClient = createServerClient as jest.Mock;

interface MockServerOptions {
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: SetAllCookies;
  };
}

function request(path: string, cookie: string) {
  return new NextRequest(`https://www.aimatrx.com${path}`, {
    headers: { host: "www.aimatrx.com", cookie },
  });
}

describe("Supabase proxy session continuity", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.matrxserver.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test";
    mockedCreateServerClient.mockReset();
  });

  it("persists a legacy cookie only after East validates its session", async () => {
    let cookiesSeenByEast: Array<{ name: string; value: string }> = [];
    mockedCreateServerClient.mockImplementation(
      (_url: string, _key: string, options: MockServerOptions) => ({
        auth: {
          getUser: async () => {
            cookiesSeenByEast = options.cookies.getAll();
            return { data: { user: { id: "east-user" } } };
          },
        },
      }),
    );

    const response = await updateSession(
      request("/notes", `${LEGACY_AUTH_COOKIE_NAME}=east-session`),
    );

    expect(cookiesSeenByEast).toContainEqual({
      name: AUTH_COOKIE_NAME,
      value: "east-session",
    });
    expect(response.cookies.get(AUTH_COOKIE_NAME)?.value).toBe("east-session");
    expect(response.headers.get("set-cookie")).toContain(
      `${LEGACY_AUTH_COOKIE_NAME}=;`,
    );
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("never persists a West-only session that East rejects", async () => {
    mockedCreateServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: null } }) },
    }));

    const response = await updateSession(
      request("/tasks", `${LEGACY_AUTH_COOKIE_NAME}=west-session`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?redirectTo=");
    expect(response.cookies.get(AUTH_COOKIE_NAME)).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain(
      `${LEGACY_AUTH_COOKIE_NAME}=;`,
    );
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("carries refreshed session cookies and no-cache headers through redirects", async () => {
    mockedCreateServerClient.mockImplementation(
      (_url: string, _key: string, options: MockServerOptions) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll(
              [
                {
                  name: AUTH_COOKIE_NAME,
                  value: "refreshed-session",
                  options: { path: "/" },
                },
              ],
              { "Cache-Control": "private, no-store" },
            );
            return { data: { user: { id: "east-user" } } };
          },
        },
      }),
    );

    const response = await updateSession(
      request("/login", `${AUTH_COOKIE_NAME}=expired-session`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.aimatrx.com/dashboard",
    );
    expect(response.cookies.get(AUTH_COOKIE_NAME)?.value).toBe(
      "refreshed-session",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("leaves a state-bound Google code on the registered root callback", async () => {
    mockedCreateServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: "east-user" } } }) },
    }));

    const response = await updateSession(
      request(
        "/?code=google-code&state=google-state",
        `${AUTH_COOKIE_NAME}=east-session; ${GOOGLE_OAUTH_REDIRECT_STATE_COOKIE}=google-state`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-pathname")).toBe("/");
  });

  it("still routes an unbound root code through the Supabase callback", async () => {
    const response = await updateSession(
      request("/?code=supabase-code", `${AUTH_COOKIE_NAME}=east-session`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "/auth/callback?code=supabase-code",
    );
  });
});

/**
 * 🚨 THE SIGN-OUT MUST NOT BE SILENT (2026-09-08, R-O3).
 *
 * When a browser's jar holds one auth cookie name BOTH unchunked and chunked,
 * `@ai-matrx/data/next` refuses both copies — serving either risks serving a
 * different person's session — and expires them. That ENDS the person's
 * session on purpose.
 *
 * `SessionIntegrityGate` reads the proxy's header off the CURRENT request, so
 * it covers every pass-through response. It cannot cover a BOUNCE: the header
 * rides the 307, and the `/login` render that follows arrives with a clean jar
 * and no signal at all. Without the sentence on the redirect, the person is
 * signed out by us and lands on a login page that says nothing.
 */
describe("an ambiguous auth cookie jar says so on the login bounce", () => {
  const NAME = AUTH_COOKIE_NAME;
  const POISONED = `${NAME}=SESSION-OF-USER-A; ${NAME}.0=SESSION-OF-; ${NAME}.1=USER-B`;

  beforeEach(() => {
    mockedCreateServerClient.mockImplementation(
      (_url: string, _key: string, _options: MockServerOptions) => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    );
  });

  it("carries the true sentence into /login instead of bouncing in silence", async () => {
    const response = await updateSession(request("/dashboard", POISONED));

    expect(response.status).toBe(307);
    const location = new URL(
      response.headers.get("location") as string,
      "https://www.aimatrx.com",
    );
    expect(location.pathname).toBe("/login");
    const said = location.searchParams.get("error") ?? "";
    expect(said).toContain("We signed you out of this browser");
    expect(said).toContain("Nothing you saved is affected");
    // the destination is still preserved — the notice must not eat it
    expect(location.searchParams.get("redirectTo")).toBeTruthy();

    // ...and the redirect really does expire the whole family, at both scopes.
    const setCookies = response.headers.getSetCookie();
    for (const name of [NAME, `${NAME}.0`, `${NAME}.1`]) {
      const writes = setCookies.filter((h) => h.startsWith(`${name}=`));
      expect(
        writes.some((h) => h.includes("Domain=.aimatrx.com") && h.includes("Max-Age=0")),
      ).toBe(true);
      expect(
        writes.some((h) => !h.includes("Domain=") && h.includes("Max-Age=0")),
      ).toBe(true);
    }
  });

  it("says nothing extra on an ordinary signed-out bounce", async () => {
    const response = await updateSession(request("/dashboard", ""));
    const location = new URL(
      response.headers.get("location") as string,
      "https://www.aimatrx.com",
    );
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBeNull();
  });
});
