/**
 * The auth flow, end to end, hop by hop.
 *
 * Each test walks a full journey the way the real code does — the middleware
 * capture, the login page read, the server-action error redirect, the email
 * round-trip, the OAuth callback — and asserts the destination is still alive
 * at the end. These are the exact journeys that were losing it.
 *
 * The helpers below mirror the real call sites one-for-one; where a hop is a
 * literal string in product code, the same literal is used here.
 */

import {
  authDestinationOr,
  captureAuthDestination,
  loginHref,
  preserveAuthDestination,
  readAuthDestination,
  withAuthDestination,
} from "@/utils/auth/auth-destination";

/** `utils/supabase/middleware.ts` — the unauthenticated bounce. */
function middlewareBounce(requestedPath: string, search = ""): string {
  return loginHref(captureAuthDestination(requestedPath, search));
}

/** `app/(auth-pages)/login/page.tsx` — what the page hands the server action. */
function loginPageRead(url: string): string | null {
  return readAuthDestination(url);
}

/** `login/actions.ts` — wrong password re-render. */
function loginFailed(currentUrl: string, message: string): string {
  return preserveAuthDestination(
    "/login",
    { redirectTo: readAuthDestination(currentUrl) },
    { error: message },
  );
}

/** `login/actions.ts` — successful sign-in landing. */
function loginSucceeded(currentUrl: string): string {
  return authDestinationOr({ redirectTo: readAuthDestination(currentUrl) });
}

/** A "Forgot your password?" / "Sign up" / "Back to sign in" link. */
function authPageLink(target: string, currentUrl: string): string {
  return preserveAuthDestination(target, currentUrl);
}

/** `forgotPasswordAction` — the link that goes out in the email. */
function resetEmailLink(forgotPageUrl: string): string {
  const nested = withAuthDestination(
    "/reset-password",
    readAuthDestination(forgotPageUrl),
  );
  return `/auth/callback?redirectTo=${encodeURIComponent(nested)}&type=recovery`;
}

/** `app/auth/callback/route.ts` — where the emailed link lands. */
function authCallback(callbackUrl: string): string {
  const params = new URLSearchParams(callbackUrl.split("?")[1] ?? "");
  const raw = params.get("redirectTo");
  const type = params.get("type");
  const recovery =
    type === "recovery"
      ? raw
        ? decodeURIComponent(raw)
        : "/reset-password"
      : null;
  return recovery && recovery.startsWith("/reset-password")
    ? recovery
    : authDestinationOr(raw ? { redirectTo: decodeURIComponent(raw) } : null);
}

/** `resetPasswordAction` — where the user lands once the password is set. */
function resetPasswordSucceeded(resetPageUrl: string): string {
  return authDestinationOr({ redirectTo: readAuthDestination(resetPageUrl) });
}

/** `loginWithGoogle` → provider → `/auth/callback`. */
function oauthRoundTrip(loginUrl: string): string {
  const dest = authDestinationOr({ redirectTo: readAuthDestination(loginUrl) });
  const callbackUrl = `/auth/callback?redirectTo=${encodeURIComponent(dest)}`;
  return authCallback(callbackUrl);
}

// ---------------------------------------------------------------------------

describe("Journey 1 — the simple case", () => {
  it("straight to /login, sign in, land on the dashboard", () => {
    const url = "/login";
    expect(loginPageRead(url)).toBeNull();
    expect(loginSucceeded(url)).toBe("/dashboard");
  });
});

describe("Journey 2 — the case Arman reported", () => {
  it("asks for /tasks, gets bounced, signs in, lands on /tasks", () => {
    const bounced = middlewareBounce("/tasks");
    expect(bounced).toBe("/login?redirectTo=%2Ftasks");
    expect(loginSucceeded(bounced)).toBe("/tasks");
  });

  it("keeps the query string of the page they asked for", () => {
    const bounced = middlewareBounce("/tasks", "?view=board&filter=open");
    expect(loginSucceeded(bounced)).toBe("/tasks?view=board&filter=open");
  });

  it("works for a deep record URL", () => {
    const bounced = middlewareBounce("/marketing/pages/abc-123");
    expect(loginSucceeded(bounced)).toBe("/marketing/pages/abc-123");
  });
});

describe("Journey 3 — wrong password, then right password", () => {
  it("survives one wrong password", () => {
    let url = middlewareBounce("/tasks");
    url = loginFailed(url, "Invalid login credentials");
    expect(loginSucceeded(url)).toBe("/tasks");
  });

  it("survives ten wrong passwords", () => {
    let url = middlewareBounce("/tasks");
    for (let i = 0; i < 10; i += 1) {
      url = loginFailed(url, "Invalid login credentials");
    }
    expect(loginSucceeded(url)).toBe("/tasks");
    // and never accumulates duplicate params
    expect(url.match(/redirectTo=/g)).toHaveLength(1);
  });
});

describe("Journey 4 — the full password-reset odyssey", () => {
  it("bounce → login → forgot → email → callback → reset → /tasks", () => {
    // 1. asks for /tasks, gets bounced to login
    const login = middlewareBounce("/tasks");
    // 2. fat-fingers the password twice
    const afterFailures = loginFailed(
      loginFailed(login, "Invalid login credentials"),
      "Invalid login credentials",
    );
    // 3. clicks "Forgot your password?"
    const forgot = authPageLink("/forgot-password", afterFailures);
    expect(readAuthDestination(forgot)).toBe("/tasks");
    // 4. the emailed link
    const emailLink = resetEmailLink(forgot);
    // 5. clicks it — lands on /auth/callback, which hops to the reset page
    const resetPage = authCallback(emailLink);
    // The hop targets the reset page and still carries /tasks. (The param may
    // arrive encoded or not — both are legal query syntax and read identically,
    // so assert the meaning, not the bytes.)
    expect(resetPage.startsWith("/reset-password?")).toBe(true);
    expect(readAuthDestination(resetPage)).toBe("/tasks");
    // 6. sets the new password
    expect(resetPasswordSucceeded(resetPage)).toBe("/tasks");
  });

  it("mistypes the new password twice on the reset page and still lands", () => {
    const login = middlewareBounce("/tasks");
    const forgot = authPageLink("/forgot-password", login);
    let resetPage = authCallback(resetEmailLink(forgot));
    for (let i = 0; i < 2; i += 1) {
      resetPage = preserveAuthDestination("/reset-password", resetPage, {
        error: "Passwords do not match",
      });
    }
    expect(resetPasswordSucceeded(resetPage)).toBe("/tasks");
  });

  it("wanders back to sign-in from the reset page without losing it", () => {
    const login = middlewareBounce("/tasks");
    const forgot = authPageLink("/forgot-password", login);
    const resetPage = authCallback(resetEmailLink(forgot));
    const backToLogin = authPageLink("/login", resetPage);
    expect(loginSucceeded(backToLogin)).toBe("/tasks");
  });
});

describe("Journey 5 — bouncing between every auth page", () => {
  it("login → sign-up → login → forgot → login, destination intact", () => {
    let url = middlewareBounce("/notes/abc");
    url = authPageLink("/sign-up", url);
    url = authPageLink("/login", url);
    url = authPageLink("/forgot-password", url);
    url = authPageLink("/login", url);
    expect(loginSucceeded(url)).toBe("/notes/abc");
  });

  it("random 50-hop walk across auth pages keeps exactly one destination", () => {
    const pages = ["/login", "/sign-up", "/forgot-password", "/reset-password"];
    let url = middlewareBounce("/vault");
    for (let i = 0; i < 50; i += 1) {
      url = authPageLink(pages[i % pages.length], url);
      if (i % 3 === 0) url = loginFailed(url, `error ${i}`);
    }
    expect(readAuthDestination(url)).toBe("/vault");
    expect(url.match(/redirectTo=/g)).toHaveLength(1);
  });
});

describe("Journey 6 — OAuth", () => {
  it("carries the destination through the provider round-trip", () => {
    const login = middlewareBounce("/tasks");
    expect(oauthRoundTrip(login)).toBe("/tasks");
  });

  it("falls back cleanly when there was no destination", () => {
    expect(oauthRoundTrip("/login")).toBe("/dashboard");
  });

  it("survives a failed OAuth attempt followed by a successful one", () => {
    const login = middlewareBounce("/tasks");
    const afterFailure = loginFailed(
      login,
      "Google authentication failed. Please try again.",
    );
    expect(oauthRoundTrip(afterFailure)).toBe("/tasks");
  });
});

describe("Journey 7 — the legacy links that shipped dead", () => {
  it("honours a `?next=` link (17 of these existed)", () => {
    expect(loginSucceeded("/login?next=%2Fvault")).toBe("/vault");
    expect(loginSucceeded("/login?next=/podcast/studio")).toBe(
      "/podcast/studio",
    );
  });

  it("honours a `?returnUrl=` link (8 of these existed)", () => {
    expect(loginSucceeded("/login?returnUrl=%2Fnotes")).toBe("/notes");
  });

  it("converts a legacy alias to the canonical param on the next hop", () => {
    const next = authPageLink("/forgot-password", "/login?next=%2Fvault");
    expect(next).toContain("redirectTo=");
    expect(readAuthDestination(next)).toBe("/vault");
  });
});

describe("Journey 8 — nothing can hijack the landing", () => {
  it("refuses an off-site destination at every hop", () => {
    for (const evil of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/%2Fevil.com",
      "javascript:alert(1)",
    ]) {
      const url = `/login?redirectTo=${encodeURIComponent(evil)}`;
      expect(loginSucceeded(url)).toBe("/dashboard");
      expect(oauthRoundTrip(url)).toBe("/dashboard");
    }
  });

  it("refuses a destination that would loop back into auth", () => {
    expect(loginSucceeded("/login?redirectTo=%2Flogin")).toBe("/dashboard");
    expect(loginSucceeded("/login?redirectTo=%2F")).toBe("/dashboard");
    expect(middlewareBounce("/login")).toBe("/login");
  });

  it("does not let a second destination overwrite the first", () => {
    // A stale link tries to inject its own destination mid-flow.
    const legitimate = middlewareBounce("/tasks");
    const hijacked = withAuthDestination(legitimate, "/attacker-chosen");
    expect(loginSucceeded(hijacked)).toBe("/tasks");
  });

  it("strips an error banner out of a captured destination", () => {
    const captured = middlewareBounce("/tasks", "?error=stale&view=board");
    expect(loginSucceeded(captured)).toBe("/tasks?view=board");
  });
});
