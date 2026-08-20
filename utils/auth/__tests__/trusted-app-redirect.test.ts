import { trustedAppRedirect } from "@/utils/auth/trusted-app-redirect";

describe("trustedAppRedirect", () => {
  it("allows only a registered first-party callback", () => {
    expect(trustedAppRedirect("https://admin.aimatrx.com/oauth/callback")).toBe(
      "https://admin.aimatrx.com/oauth/callback",
    );
    expect(
      trustedAppRedirect("https://evil.example/oauth/callback"),
    ).toBeNull();
    expect(
      trustedAppRedirect("https://admin.aimatrx.com/collect-tokens"),
    ).toBeNull();
  });

  it("rejects user-info and malformed redirects", () => {
    expect(
      trustedAppRedirect(
        "https://admin.aimatrx.com@evil.example/oauth/callback",
      ),
    ).toBeNull();
    expect(trustedAppRedirect("not a url")).toBeNull();
  });
});
