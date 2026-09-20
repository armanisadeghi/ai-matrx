/** @jest-environment node */

import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";
import { NextRequest } from "next/server";
import { POST, PUT } from "./route";

const mockGetUser = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: mockWithClaims({ getUser: mockGetUser }) }),
}));

function request(
  method: "POST" | "PUT",
  body?: object,
  origin = "https://www.aimatrx.com",
  cookie?: string,
) {
  return new NextRequest(`${origin}/api/google/oauth/redirect-state`, {
    method,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
});

function authenticated(userId = "user-1") {
  return { data: { user: { id: userId } }, error: null };
}

async function mint(userId = "user-1") {
  mockGetUser.mockResolvedValue(authenticated(userId));
  return POST(request("POST", { initiatingUserId: userId }));
}

describe("Google OAuth redirect state route", () => {
  it("mints a same-origin HttpOnly state cookie", async () => {
    const response = await mint();
    const body = (await response.json()) as {
      state: string;
      redirectUri: string;
      userId: string;
    };
    expect(response.status).toBe(200);
    expect(body.redirectUri).toBe("https://www.aimatrx.com");
    expect(body.userId).toBe("user-1");
    expect(body.state).toHaveLength(43);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it.each([
    [
      "an auth-service error",
      503,
      { data: { user: null }, error: new Error("temporarily unavailable") },
    ],
    ["a confirmed missing session", 401, { data: { user: null }, error: null }],
    ["a different server user", 409, authenticated("user-2")],
  ])("does not mint state during %s", async (_name, status, authResult) => {
    mockGetUser.mockResolvedValue(authResult);
    const response = await POST(
      request("POST", { initiatingUserId: "user-1" }),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).not.toMatchObject({
      state: expect.anything(),
      redirectUri: expect.anything(),
    });
  });

  it("refuses a cross-origin mint request", async () => {
    const response = await POST(
      new NextRequest(
        "https://www.aimatrx.com/api/google/oauth/redirect-state",
        { method: "POST", headers: { origin: "https://evil.example" } },
      ),
    );
    expect(response.status).toBe(403);
  });

  it("validates the exact cookie state and clears it", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const minted = await mint();
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    if (!cookieValue) {
      throw new Error("Expected Google OAuth redirect state cookie to be minted.");
    }
    const validate = request(
      "PUT",
      { state: body.state, initiatingUserId: "user-1" },
      "https://www.aimatrx.com",
      `mx_google_oauth_redirect_state=${cookieValue}`,
    );
    const response = await PUT(validate);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, userId: "user-1" });
    expect(response.headers.get("set-cookie")).toContain(
      "mx_google_oauth_redirect_state=",
    );
    const replay = await PUT(
      request("PUT", { state: body.state, initiatingUserId: "user-1" }),
    );
    expect(replay.status).toBe(400);
  });

  it("does not let a changed client initiator rebind the server-bound user", async () => {
    const minted = await mint("user-1");
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    mockGetUser.mockResolvedValue(authenticated("user-1"));
    const response = await PUT(
      request(
        "PUT",
        { state: body.state, initiatingUserId: "user-2" },
        "https://www.aimatrx.com",
        `mx_google_oauth_redirect_state=${cookieValue}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, userId: "user-1" });
  });

  it("preserves an unrelated valid cookie after an invalid callback", async () => {
    const minted = await mint();
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    const withCookie = (state: string) =>
      request(
        "PUT",
        { state },
        "https://www.aimatrx.com",
        `mx_google_oauth_redirect_state=${cookieValue}`,
      );
    const invalid = await PUT(withCookie("unrelated-state"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("set-cookie")).toBeNull();
    mockGetUser.mockResolvedValue(authenticated());
    const valid = await PUT(withCookie(body.state));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ valid: true, userId: "user-1" });
  });

  it.each([
    [
      "an auth-service error",
      503,
      { data: { user: null }, error: new Error("temporarily unavailable") },
    ],
    ["a confirmed missing session", 401, { data: { user: null }, error: null }],
  ])("preserves valid state during %s", async (_name, status, authResult) => {
    const minted = await mint();
    mockGetUser.mockResolvedValue(authResult);
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    const response = await PUT(
      request(
        "PUT",
        { state: body.state, initiatingUserId: "user-1" },
        "https://www.aimatrx.com",
        `mx_google_oauth_redirect_state=${cookieValue}`,
      ),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).not.toMatchObject({
      error: expect.stringContaining("session changed"),
    });
  });

  it("accepts the same pending state after a transient auth-service failure", async () => {
    const minted = await mint();
    mockGetUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new Error("temporarily unavailable"),
      })
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    const retry = () =>
      PUT(
        request(
          "PUT",
          { state: body.state, initiatingUserId: "user-1" },
          "https://www.aimatrx.com",
          `mx_google_oauth_redirect_state=${cookieValue}`,
        ),
      );
    expect((await retry()).status).toBe(503);
    const success = await retry();
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ valid: true, userId: "user-1" });
  });

  it("consumes valid state when a different authenticated user returns", async () => {
    const minted = await mint();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    const response = await PUT(
      request(
        "PUT",
        { state: body.state, initiatingUserId: "user-1" },
        "https://www.aimatrx.com",
        `mx_google_oauth_redirect_state=${cookieValue}`,
      ),
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toContain(
      "mx_google_oauth_redirect_state=",
    );
  });
});
