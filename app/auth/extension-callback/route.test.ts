/** @jest-environment node */

import { describe, expect, it } from "@jest/globals";
import { GET } from "./route";

describe("extension OAuth callback landing", () => {
  it("never reflects the one-time code or state and prevents referral/cache leakage", async () => {
    const response = GET(
      new Request("https://aimatrx.com/auth/extension-callback?code=secret-code&state=secret-state"),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Return to Matrx Extend");
    expect(body).not.toContain("secret-code");
    expect(body).not.toContain("secret-state");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("rejects token-shaped callback parameters without reflecting their values", async () => {
    const response = GET(
      new Request("https://aimatrx.com/auth/extension-callback?access_token=secret-token"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("secret-token");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
