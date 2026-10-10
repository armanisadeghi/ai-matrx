import { parseXBrowserSession, safeXReturn, xBackendOrigin } from "../session";

describe("X browser round trip", () => {
  const session = () => ({
    state: "state",
    browserProof: "proof",
    organizationId: "org",
    returnUrl: "/marketing/brand/socials/accounts",
    backendOrigin: "http://localhost:8000",
    createdAt: Date.now(),
  });

  it("rejects expired and future cookies before any token exchange", () => {
    expect(
      parseXBrowserSession(
        JSON.stringify({ ...session(), createdAt: Date.now() - 600_001 }),
      ),
    ).toBeNull();
    expect(
      parseXBrowserSession(
        JSON.stringify({ ...session(), createdAt: Date.now() + 60_000 }),
      ),
    ).toBeNull();
  });
  it("keeps the admitted organization and backend for the callback", () => {
    expect(parseXBrowserSession(JSON.stringify(session()))).toMatchObject({
      organizationId: "org",
      backendOrigin: "http://localhost:8000",
    });
  });
  it("refuses a token recipient outside configured servers", () => {
    expect(xBackendOrigin("https://attacker.example")).toBeNull();
    expect(xBackendOrigin("http://localhost:8000@attacker.example")).toBeNull();
    expect(
      xBackendOrigin("http://localhost:8000/token-stealing-path"),
    ).toBeNull();
    expect(
      parseXBrowserSession(
        JSON.stringify({
          ...session(),
          backendOrigin: "https://attacker.example",
        }),
      ),
    ).toBeNull();
  });
  it("returns only to the two product mounts", () => {
    for (const value of [
      "//attacker.example",
      "/\\attacker.example",
      "/api/admin/action",
      "/marketing/brand/socials/accounts\n",
    ]) {
      expect(safeXReturn(value)).toBe(
        "/user-settings/integrations?connection=x",
      );
    }
    expect(safeXReturn("/marketing/brand/socials/accounts?view=own")).toBe(
      "/marketing/brand/socials/accounts?view=own",
    );
  });
});
