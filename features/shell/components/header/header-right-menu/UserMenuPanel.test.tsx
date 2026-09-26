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
 * `UserMenuPanel.tsx` is plain JSX with no hooks that need a real DOM, so
 * this is a source-text forcing function (same convention as
 * ShellUserAvatarImage.test.tsx and archivedItemsLaw.test.ts in this
 * codebase, which has no React testing library): it fails the moment
 * `<ThemeToggleMenuItem />` moves back inside the `id="admin"` group, and
 * passes only while it sits in its own person-level group.
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

describe("UserMenuPanel — theme toggle is not under ADMIN", () => {
  it("does not render ThemeToggleMenuItem inside the admin group", () => {
    const source = readSource();
    const adminBlock = adminGroupBlock(source);
    expect(adminBlock).not.toContain("ThemeToggleMenuItem");
  });

  it("files the theme toggle under a person-level, non-admin group", () => {
    const source = readSource();
    const anchor = source.indexOf("<ThemeToggleMenuItem");
    expect(anchor).toBeGreaterThan(-1);

    const enclosingGroupStart = source.lastIndexOf("<MenuGroup", anchor);
    expect(enclosingGroupStart).toBeGreaterThan(-1);

    const groupHeader = source.slice(enclosingGroupStart, anchor);
    expect(groupHeader).not.toMatch(/id="admin"/);
    expect(groupHeader).not.toMatch(/label="Admin"/i);
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
