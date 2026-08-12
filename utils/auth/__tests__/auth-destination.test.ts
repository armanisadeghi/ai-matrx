/**
 * The auth-destination law, as executable rules.
 *
 * Every case here is a real way the destination was being lost before this
 * primitive existed — a `?next=` link nobody read, an error re-render that
 * rebuilt the URL, a password reset that round-tripped through email.
 */

import {
  AUTH_DEST_PARAM,
  authDestinationOr,
  captureAuthDestination,
  isNonDestinationPath,
  loginHref,
  normalizeAuthDestination,
  preserveAuthDestination,
  readAuthDestination,
  withAuthDestination,
} from "@/utils/auth/auth-destination";

describe("normalizeAuthDestination", () => {
  it("accepts a plain same-site path", () => {
    expect(normalizeAuthDestination("/tasks")).toBe("/tasks");
    expect(normalizeAuthDestination("/tasks?view=board")).toBe("/tasks?view=board");
  });

  it("unwraps encoded values that rode through a provider or email link", () => {
    expect(normalizeAuthDestination("%2Ftasks")).toBe("/tasks");
    expect(normalizeAuthDestination("%252Ftasks")).toBe("/tasks");
  });

  it("rejects off-site targets (open redirect)", () => {
    expect(normalizeAuthDestination("https://evil.com")).toBeNull();
    expect(normalizeAuthDestination("//evil.com")).toBeNull();
    expect(normalizeAuthDestination("/\\evil.com")).toBeNull();
    expect(normalizeAuthDestination("/%2Fevil.com")).toBeNull();
    expect(normalizeAuthDestination("@evil.com")).toBeNull();
  });

  it("rejects auth pages — they can never be a destination", () => {
    for (const path of [
      "/",
      "/login",
      "/sign-up",
      "/forgot-password",
      "/reset-password",
      "/error",
      "/auth/callback",
      "/auth/confirm",
      "/login?error=nope",
    ]) {
      expect(normalizeAuthDestination(path)).toBeNull();
    }
    expect(isNonDestinationPath("/login")).toBe(true);
    expect(isNonDestinationPath("/tasks")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(normalizeAuthDestination("")).toBeNull();
    expect(normalizeAuthDestination(null)).toBeNull();
    expect(normalizeAuthDestination(undefined)).toBeNull();
  });
});

describe("readAuthDestination — every alias is honoured", () => {
  it("reads the canonical param", () => {
    expect(readAuthDestination(new URLSearchParams("redirectTo=/tasks"))).toBe("/tasks");
  });

  it("reads legacy aliases that used to be silently ignored", () => {
    // 17 `/login?next=` and 8 `?returnUrl=` call sites shipped dead.
    expect(readAuthDestination(new URLSearchParams("next=/vault"))).toBe("/vault");
    expect(readAuthDestination(new URLSearchParams("returnUrl=/notes"))).toBe("/notes");
    expect(readAuthDestination(new URLSearchParams("return_to=/files"))).toBe("/files");
  });

  it("prefers the canonical param over an alias on the same URL", () => {
    expect(
      readAuthDestination(new URLSearchParams("next=/wrong&redirectTo=/right")),
    ).toBe("/right");
  });

  it("skips an unusable alias and keeps looking", () => {
    expect(
      readAuthDestination(new URLSearchParams("redirectTo=/login&next=/tasks")),
    ).toBe("/tasks");
  });

  it("reads a Next.js searchParams object", () => {
    expect(readAuthDestination({ redirectTo: "/tasks" })).toBe("/tasks");
    expect(readAuthDestination({ next: ["/tasks", "/other"] })).toBe("/tasks");
  });

  it("reads FormData", () => {
    const form = new FormData();
    form.set("redirectTo", "/tasks");
    expect(readAuthDestination(form)).toBe("/tasks");
  });

  it("reads a raw URL or query string", () => {
    expect(readAuthDestination("/login?redirectTo=/tasks")).toBe("/tasks");
    expect(readAuthDestination("redirectTo=/tasks")).toBe("/tasks");
  });

  it("returns null — not /dashboard — when there is genuinely nothing", () => {
    expect(readAuthDestination(new URLSearchParams(""))).toBeNull();
    expect(readAuthDestination(null)).toBeNull();
    expect(authDestinationOr(null)).toBe("/dashboard");
  });
});

describe("withAuthDestination — NEVER creates a second destination", () => {
  it("attaches one when the target has none", () => {
    expect(withAuthDestination("/login", "/tasks")).toBe(
      `/login?${AUTH_DEST_PARAM}=%2Ftasks`,
    );
  });

  it("leaves an existing destination untouched (the core rule)", () => {
    const target = "/login?redirectTo=%2Ffirst";
    expect(withAuthDestination(target, "/second")).toBe(target);
  });

  it("does not overwrite a destination held under a legacy alias", () => {
    const target = "/login?next=%2Ffirst";
    expect(withAuthDestination(target, "/second")).toBe(target);
  });

  it("is a no-op when there is nothing worth attaching", () => {
    expect(withAuthDestination("/login", null)).toBe("/login");
    expect(withAuthDestination("/login", "/login")).toBe("/login");
    expect(withAuthDestination("/login", "https://evil.com")).toBe("/login");
  });

  it("keeps other params and the hash", () => {
    const out = withAuthDestination("/login?error=bad#top", "/tasks");
    expect(out).toContain("error=bad");
    expect(out).toContain(`${AUTH_DEST_PARAM}=%2Ftasks`);
    expect(out.endsWith("#top")).toBe(true);
  });

  it("is idempotent across repeated hops", () => {
    const once = withAuthDestination("/login", "/tasks");
    expect(withAuthDestination(withAuthDestination(once, "/x"), "/y")).toBe(once);
  });
});

describe("preserveAuthDestination — the error-path workhorse", () => {
  it("carries the destination onto an error re-render", () => {
    // Wrong password: /login?redirectTo=/tasks -> /login?error=...&redirectTo=/tasks
    const out = preserveAuthDestination("/login", "/login?redirectTo=%2Ftasks", {
      error: "Invalid login credentials",
    });
    expect(readAuthDestination(out)).toBe("/tasks");
    expect(out).toContain("error=Invalid+login+credentials");
  });

  it("survives an unbounded number of failed attempts", () => {
    let url = "/login?redirectTo=%2Ftasks";
    for (let i = 0; i < 25; i += 1) {
      url = preserveAuthDestination("/login", url, { error: `attempt ${i}` });
    }
    expect(readAuthDestination(url)).toBe("/tasks");
  });

  it("carries the destination across different auth pages", () => {
    const login = "/login?redirectTo=%2Ftasks";
    const forgot = preserveAuthDestination("/forgot-password", login);
    const reset = preserveAuthDestination("/reset-password", forgot);
    const backToLogin = preserveAuthDestination("/login", reset);
    expect(readAuthDestination(backToLogin)).toBe("/tasks");
  });

  it("adds nothing when there was no destination to begin with", () => {
    const out = preserveAuthDestination("/login", "/login", { error: "x" });
    expect(readAuthDestination(out)).toBeNull();
    expect(out).toBe("/login?error=x");
  });
});

describe("captureAuthDestination", () => {
  it("captures a path with its query", () => {
    expect(captureAuthDestination("/tasks", "?view=board")).toBe("/tasks?view=board");
    expect(captureAuthDestination("/tasks?view=board")).toBe("/tasks?view=board");
  });

  it("strips auth chrome so a stale banner is never baked in", () => {
    expect(captureAuthDestination("/tasks", "?view=board&error=nope&success=yay")).toBe(
      "/tasks?view=board",
    );
    expect(captureAuthDestination("/tasks", "?redirectTo=%2Fold")).toBe("/tasks");
  });

  it("refuses to capture an auth page", () => {
    expect(captureAuthDestination("/login")).toBeNull();
    expect(captureAuthDestination("/")).toBeNull();
  });
});

describe("loginHref", () => {
  it("builds a sign-in link that carries the destination", () => {
    expect(readAuthDestination(loginHref("/tasks"))).toBe("/tasks");
    expect(loginHref(null)).toBe("/login");
  });
});
