/**
 * 🚨 DARK MODE IS NEVER FILED UNDER ADMIN.
 *
 * cold-walk-13 friction (common-docs/projects/masterwork-methods-census/
 * jobs-bar-2026-09-16/cold-walk-13/README.md): "Dark Mode still sits under a
 * menu section headed ADMIN" — a person-level preference living inside the
 * admin-only accordion tells every non-admin (and every admin reading it)
 * that theme is an admin capability, and buries it behind a group most
 * people have no reason to open.
 *
 * Since 2026-09-30 the theme switch lives in the account rail's Settings
 * slot (`ShellSettingsMenu`). Source-text forcing function: it fails the
 * moment the switch moves back into the avatar menu or behind an admin gate.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE_PATH = path.join(__dirname, "UserMenuPanel.tsx");

function readSource(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

/** Slices out the `<MenuGroup id="admin" ...>...</MenuGroup>` block. */
function adminGroupBlock(source: string): string {
  const start = source.indexOf('id="admin"');
  expect(start).toBeGreaterThan(-1);
  const openTagStart = source.lastIndexOf("<MenuGroup", start);
  const end = source.indexOf("</MenuGroup>", start);
  expect(end).toBeGreaterThan(-1);
  return source.slice(openTagStart, end + "</MenuGroup>".length);
}

describe("Dark mode is a person-level setting — the rail's Settings slot, never ADMIN", () => {
  // Owner, 2026-09-30: light/dark, Media and Preferences moved out of the
  // avatar menu into the account rail's Settings slot (ShellSettingsMenu).
  it("lives in the Settings menu, which no admin gate wraps", () => {
    const settings = readFileSync(
      path.join(__dirname, "..", "..", "account-rail", "ShellSettingsMenu.tsx"),
      "utf8",
    );
    // Light | Dark | Device — "Device" (system) is the default (2026-10-01).
    expect(settings).toContain("dispatch(setMode(choice))");
    expect(settings).toMatch(/mode: "system", label: "Device"/);
    expect(settings).not.toMatch(/selectIsSuperAdmin|isAdmin/);
  });

  it("is not in the avatar menu at all, admin group included", () => {
    const source = readSource();
    expect(source).not.toContain("ThemeToggleMenuItem");
    expect(adminGroupBlock(source)).not.toContain("setMode");
  });
});

describe("UserMenuPanel — Intelligence is a person-level destination", () => {
  it("links /intelligence outside the admin group", () => {
    const source = readSource();
    const anchor = source.indexOf('href="/intelligence"');
    expect(anchor).toBeGreaterThan(-1);
    expect(adminGroupBlock(source)).not.toContain('href="/intelligence"');
  });
});
