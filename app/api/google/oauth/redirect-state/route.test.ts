/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST, PUT } from "./route";

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

describe("Google OAuth redirect state route", () => {
  it("mints a same-origin HttpOnly state cookie", async () => {
    const response = await POST(request("POST"));
    const body = (await response.json()) as {
      state: string;
      redirectUri: string;
    };
    expect(response.status).toBe(200);
    expect(body.redirectUri).toBe("https://www.aimatrx.com");
    expect(body.state).toHaveLength(43);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
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
    const minted = await POST(request("POST"));
    const body = (await minted.json()) as { state: string };
    const cookieValue = minted.cookies.get(
      "mx_google_oauth_redirect_state",
    )?.value;
    if (!cookieValue) {
      throw new Error("Expected Google OAuth redirect state cookie to be minted.");
    }
    const validate = request(
      "PUT",
      { state: body.state },
      "https://www.aimatrx.com",
      `mx_google_oauth_redirect_state=${cookieValue}`,
    );
    const response = await PUT(validate);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(response.headers.get("set-cookie")).toContain(
      "mx_google_oauth_redirect_state=",
    );
  });
});
