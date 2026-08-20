import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");

const INTENTIONAL_BARE_LOGIN_AFTER_SIGN_OUT = new Set([
  "actions/auth.actions.ts",
  "components/layout/MatrxLayout.tsx",
  "components/layout/MatrxLayoutDirect.tsx",
  "features/shell/components/header/header-right-menu/SignOutMenuItem.tsx",
]);

function grepFiles(pattern: string): string[] {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", pattern, "--", "*.ts", "*.tsx"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter(
        (file) => !file.includes("__tests__") && !file.endsWith(".test.ts"),
      );
  } catch (error: unknown) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

describe("auth entrypoint architecture", () => {
  it("has no bare sign-in navigation outside explicit sign-out flows", () => {
    const files = grepFiles(
      String.raw`href=["']/login["']|(router\.(push|replace)|redirect)\(["']/login["']\)|location\.href[[:space:]]*=[[:space:]]*["']/login["']`,
    ).filter((file) => !INTENTIONAL_BARE_LOGIN_AFTER_SIGN_OUT.has(file));
    expect(files).toEqual([]);
  });

  it("never navigates to the nonexistent /signup route", () => {
    expect(
      grepFiles(String.raw`(href=|push\(|replace\().*["']/signup([?"'])`),
    ).toEqual([]);
  });

  it("keeps the shell header on the canonical client destination hook", () => {
    const header = readFileSync(
      path.join(
        REPO_ROOT,
        "features/shell/components/header/header-right-menu/GuestUserMenuTrigger.tsx",
      ),
      "utf8",
    );
    expect(header).toContain("useLoginHref()");
    expect(header).not.toContain('href="/login"');
  });
});
