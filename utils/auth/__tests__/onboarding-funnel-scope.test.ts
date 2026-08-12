/**
 * THE FUNNEL MAY ONLY FIRE ON /dashboard.
 *
 * `/welcome` is the default landing for a new user who arrived with no page in
 * mind — never an override of a destination they actually asked for. A new user
 * is the most important person to deliver to what they came for: they showed up
 * to make meta titles or try agent creation, and that intent is what earned the
 * signup. Funnelling them elsewhere throws it away.
 *
 * This is enforced structurally rather than behaviourally: the redirect lives in
 * exactly one route (`app/(core)/dashboard/layout.tsx`), so it can only ever
 * intercept `/dashboard`. A second call site — in the root layout, the
 * middleware, or an auth action — WOULD see users who have a real destination
 * and would silently eat it. This test fails the moment one appears.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

/** The ONE route allowed to funnel a new user to /welcome. */
const ALLOWED_FUNNEL_SITES = ["app/(core)/dashboard/layout.tsx"];

/** Files that legitimately mention the helpers without performing a redirect. */
const DEFINITION_FILES = ["utils/onboarding.ts"];

function grepFiles(pattern: string): string[] {
  let out = "";
  try {
    out = execFileSync(
      "grep",
      [
        "-rl",
        "--include=*.ts",
        "--include=*.tsx",
        "-E",
        pattern,
        "app",
        "features",
        "utils",
        "lib",
        "components",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
  } catch (err: unknown) {
    // grep exits 1 when there are no matches — that is a valid empty result.
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
  // Tests describe the rule; they never enforce it at runtime.
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts"));
}

describe("onboarding funnel scope", () => {
  it("only app/(core)/dashboard/layout.tsx sends a new user to /welcome", () => {
    const callSites = grepFiles("isNewUser|isNewSupabaseUser|WELCOME_ROUTE").filter(
      (f) => !DEFINITION_FILES.includes(f),
    );

    expect(callSites.sort()).toEqual(ALLOWED_FUNNEL_SITES.sort());
  });

  it("no auth action, middleware, or proxy funnels a new user", () => {
    const authLayer = grepFiles("isNewUser|isNewSupabaseUser|WELCOME_ROUTE").filter(
      (f) =>
        f.startsWith("utils/auth/") ||
        f.startsWith("utils/supabase/") ||
        f.startsWith("actions/") ||
        f.includes("auth-pages"),
    );

    // The destination system must know nothing about onboarding — it delivers
    // the user to what they asked for and stops there.
    expect(authLayer).toEqual([]);
  });
});
