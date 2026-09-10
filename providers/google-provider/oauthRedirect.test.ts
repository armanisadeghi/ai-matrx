import {
  GOOGLE_OAUTH_REDIRECT_TTL_MS,
  buildGoogleOAuthRedirectPending,
  assertGoogleOAuthRedirectInitiator,
  consumeGoogleOAuthRedirectPending,
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
      consumeGoogleOAuthRedirectPending(storage, "state-1", ORIGIN, 2_000),
    ).toEqual(pending);
    expect(
      consumeGoogleOAuthRedirectPending(storage, "state-1", ORIGIN, 2_000),
    ).toBeNull();
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
      consumeGoogleOAuthRedirectPending(
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
    expect(() => assertGoogleOAuthRedirectInitiator(pending, "admin-user")).toThrow(
      "session changed",
    );
    expect(() => assertGoogleOAuthRedirectInitiator(pending, "reviewer-user")).not.toThrow();
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
