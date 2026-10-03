/**
 * Every server-side OAuth start goes through `startOAuthSignIn`.
 *
 * A direct `supabase.auth.signInWithOAuth` call skips the clone sign-in bridge,
 * and on the clone-mode dev server Google answers it with
 * `redirect_uri_mismatch` (2026-10-03: localhost was unusable for every
 * Google sign-in). This scan fails on any new direct call.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../..");

/** Files allowed to call it directly: the door itself, and the browser-only helper (no server action). */
const ALLOWED = new Set(["utils/supabase/oauthStart.ts", "utils/supabase/auth.ts"]);

function directCallers(): string[] {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["grep", "-l", "-E", "\\.auth\\.signInWithOAuth\\(", "--", "*.ts", "*.tsx", ":!node_modules", ":!**/dist/**"],
      { cwd: REPO, encoding: "utf8" },
    );
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
  return out.split("\n").filter(Boolean).filter((file) => !ALLOWED.has(file) && !file.includes("__tests__"));
}

describe("OAuth sign-in door", () => {
  it("no server code starts OAuth around startOAuthSignIn", () => {
    expect(directCallers()).toEqual([]);
  });
});
