import {
  GOOGLE_OAUTH_REDIRECT_TTL_MS,
  buildGoogleOAuthRedirectPending,
  assertGoogleOAuthRedirectInitiator,
  clearGoogleOAuthRedirectPending,
  readGoogleOAuthRedirectPending,
  returnPathWithGoogleOAuthResult,
  storeGoogleOAuthRedirectPending,
} from "./oauthRedirect";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const ORIGIN = "https://www.aimatrx.com";

describe("Google OAuth redirect state", () => {
  it("round-trips one same-origin pending connection exactly once", () => {
    const storage = new MemoryStorage();
    const pending = buildGoogleOAuthRedirectPending(
      "state-1",
      {
        returnTo: "/files/all?view=grid",
        initiatingUserId: "user-1",
        owner: { type: "user" },
        organizationContextId: "org-1",
      },
      ORIGIN,
      1_000,
    );
    storeGoogleOAuthRedirectPending(storage, pending);

    expect(
      readGoogleOAuthRedirectPending(storage, "state-1", ORIGIN, 2_000),
    ).toEqual(pending);
    clearGoogleOAuthRedirectPending(storage, "state-1");
    expect(
      readGoogleOAuthRedirectPending(storage, "state-1", ORIGIN, 2_000),
    ).toBeNull();
  });

  it("preserves the capability and exact target through redirect pending state", () => {
    const storage = new MemoryStorage();
    const pending = buildGoogleOAuthRedirectPending(
      "state-capability",
      {
        initiatingUserId: "user-1",
        owner: { type: "user" },
        organizationContextId: "org-1",
        connectionPurpose: "google_capability",
        targetConnectionId: "connection-contacts",
        capabilityKey: "contacts",
      },
      ORIGIN,
    );
    storeGoogleOAuthRedirectPending(storage, pending);

    expect(
      readGoogleOAuthRedirectPending(storage, "state-capability", ORIGIN),
    ).toMatchObject({
      connectionPurpose: "google_capability",
      targetConnectionId: "connection-contacts",
      capabilityKey: "contacts",
    });
  });

  it("preserves a real product grant and rejects incomplete or expired selections", () => {
    const storage = new MemoryStorage();
    const options = {
      initiatingUserId: "reviewer-user",
      owner: { type: "user" as const },
      organizationContextId: "review-org",
      connectionPurpose: "google_products" as const,
      targetConnectionId: "review-mailbox",
      capabilityKeys: ["gmail_modify"],
      scopes: ["openid", "https://www.googleapis.com/auth/gmail.modify"],
    };
    const pending = buildGoogleOAuthRedirectPending("products", options, ORIGIN, 1_000);
    storeGoogleOAuthRedirectPending(storage, pending);
    expect(readGoogleOAuthRedirectPending(storage, "products", ORIGIN, 1_001)).toMatchObject(options);
    expect(readGoogleOAuthRedirectPending(storage, "products", ORIGIN,
      1_000 + GOOGLE_OAUTH_REDIRECT_TTL_MS + 1)).toBeNull();
    storage.setItem("mx-google-oauth-redirect:products", JSON.stringify({ ...pending, capabilityKeys: [] }));
    expect(readGoogleOAuthRedirectPending(storage, "products", ORIGIN, 1_001)).toBeNull();
    storage.setItem("mx-google-oauth-redirect:products", JSON.stringify({ ...pending, scopes: [""] }));
    expect(readGoogleOAuthRedirectPending(storage, "products", ORIGIN, 1_001)).toBeNull();
    storage.setItem("mx-google-oauth-redirect:products", JSON.stringify({ ...pending, createdAt: 2_000 }));
    expect(readGoogleOAuthRedirectPending(storage, "products", ORIGIN, 1_001)).toBeNull();
    expect(() => buildGoogleOAuthRedirectPending("products", { ...options, capabilityKeys: [] }, ORIGIN))
      .toThrow("Choose Google products");
  });

  it("rejects expired, mismatched, and cross-origin continuations", () => {
    const storage = new MemoryStorage();
    const pending = buildGoogleOAuthRedirectPending(
      "state-2",
      {
        returnTo: "/files/all",
        initiatingUserId: "user-1",
        owner: { type: "user" },
        organizationContextId: "org-1",
      },
      ORIGIN,
      1_000,
    );
    storeGoogleOAuthRedirectPending(storage, pending);
    expect(
      readGoogleOAuthRedirectPending(
        storage,
        "state-2",
        ORIGIN,
        1_000 + GOOGLE_OAUTH_REDIRECT_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(() =>
      buildGoogleOAuthRedirectPending(
        "state-3",
        {
          returnTo: "https://evil.example/files",
          initiatingUserId: "user-1",
          owner: { type: "user" },
          organizationContextId: "org-1",
        },
        ORIGIN,
      ),
    ).toThrow("only to AI Matrx");
  });

  it("blocks a callback after the Matrx session changes but accepts its initiator", () => {
    const pending = buildGoogleOAuthRedirectPending(
      "state-4",
      {
        initiatingUserId: "reviewer-user",
        owner: { type: "user" },
        organizationContextId: "org-1",
      },
      ORIGIN,
    );
    expect(() =>
      assertGoogleOAuthRedirectInitiator(pending, "admin-user"),
    ).toThrow("session changed");
    expect(() =>
      assertGoogleOAuthRedirectInitiator(pending, "reviewer-user"),
    ).not.toThrow();
  });

  it("adds a bounded callback result without changing the return origin", () => {
    expect(
      returnPathWithGoogleOAuthResult(
        "/files/all?view=grid",
        ORIGIN,
        "connected",
      ),
    ).toBe("/files/all?view=grid&google_oauth=connected");
  });
});
