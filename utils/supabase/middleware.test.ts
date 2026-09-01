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
