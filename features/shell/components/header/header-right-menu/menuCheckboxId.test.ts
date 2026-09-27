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

/**
 * A `<button>`/`<a>` inside `<label htmlFor>` never activates the label (HTML
 * label activation skips interactive descendants), so "Submit Feedback" and
 * every other button item left the menu open over the window it opened
 * (page-pass 2026-09-27). Items wrap in `MenuItemCloseLabel`, which closes
 * the menu itself. Mutation: put back a bare `<label htmlFor={menuCheckboxId}`.
 */
describe("user-menu items close through MenuItemCloseLabel", () => {
  // The trigger TOGGLES the checkbox on purpose — it is not an item.
  it.each(ITEM_FILES.filter((n) => n !== "UserMenuTrigger.tsx"))("%s has no bare label close", (name) => {
    const text = readFileSync(path.join(DIR, name), "utf8");
    expect(text).not.toMatch(/<label\s+htmlFor=\{menuCheckboxId\}/);
  });
});
