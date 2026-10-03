// The organization is chosen with the sidebar's organization switcher (`ShellOrgSwitcher`).
// The avatar menu has no organization choice, so a string that sends someone there is a
// dead end (found on a walk of the CRM New person form, 2026-10-02). Fails if any source
// line outside a comment names "the menu under your avatar" again.

import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(__dirname, "../../..");
const SELF = "no-string-sends-people-to-a-menu-that-has-no-organization.test.ts";
const PHRASE = /(menu|dropdown) under (your|the) avatar/i;

it("no source string names the avatar menu as where the organization is chosen", () => {
  const files = execFileSync(
    "git",
    ["grep", "-lIiE", "(menu|dropdown) under (your|the) avatar", "--", "*.ts", "*.tsx"],
    { cwd: REPO, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const offenders: string[] = [];
  for (const file of files) {
    if (file.endsWith(SELF)) continue;
    const lines = execFileSync("git", ["grep", "-nIiE", PHRASE.source, "--", file], { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      const text = line.replace(/^.*?:\d+:/, "").trim();
      if (/^(\/\/|\*|\/\*)/.test(text) || /toMatch\(/.test(text)) continue;
      offenders.push(`${file}: ${text.slice(0, 120)}`);
    }
  }
  expect(offenders).toEqual([]);
});
