/**
 * Menu items close THE menu they live in. Hardcoding `#shell-user-menu`
 * left the canvas-pane copy open and sent the click at the hidden header
 * checkbox. Mutation: restore `htmlFor="shell-user-menu"` in a menu item
 * file (except ShellUserMenu, which owns that id) — this file goes RED.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.join(
  process.cwd(),
  "features/shell/components/header/header-right-menu",
);

const ALLOWED_HARDCODE = new Set([
  "ShellUserMenu.tsx",
  "menuCheckboxId.tsx",
  "menuCheckboxId.test.ts",
]);

const ITEM_FILES = readdirSync(DIR).filter(
  (name) =>
    (name.endsWith(".tsx") || name.endsWith(".ts")) &&
    !ALLOWED_HARDCODE.has(name),
);

describe("user-menu items close the active checkbox", () => {
  it.each(ITEM_FILES)("%s does not hardcode #shell-user-menu", (name) => {
    const text = readFileSync(path.join(DIR, name), "utf8");
    expect(text).not.toContain('htmlFor="shell-user-menu"');
  });

});
