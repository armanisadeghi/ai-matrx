import { legacyBrandRedirectUrl } from "../legacy-brand-host";

describe("legacyBrandRedirectUrl", () => {
  it("moves every appmatrx.com page to the main host, keeping path and query", () => {
    for (const host of ["appmatrx.com", "www.appmatrx.com", "WWW.APPMATRX.COM"]) {
      expect(
        legacyBrandRedirectUrl(host, "/how-it-works", "?ref=x", "www.aimatrx.com")?.toString(),
      ).toBe("https://www.aimatrx.com/how-it-works?ref=x");
    }
    expect(legacyBrandRedirectUrl("appmatrx.com", "/", "", "www.aimatrx.com")?.toString()).toBe(
      "https://www.aimatrx.com/",
    );
  });

  it("serves the main host and every other host in place", () => {
    for (const host of [
      "www.aimatrx.com",
      "aimatrx.com",
      "manage.aimatrx.com",
      "localhost:3000",
      "ai-matrx-admin.vercel.app",
      null,
    ]) {
      expect(legacyBrandRedirectUrl(host, "/", "", "www.aimatrx.com")).toBeNull();
    }
  });
});
