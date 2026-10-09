/**
 * ONE Radix layer stack (G17, 2026-10-07).
 *
 * Radix keeps "which layer is on top" and "which focus trap is active" in
 * MODULE state — `@radix-ui/react-dismissable-layer`'s layer context and
 * `@radix-ui/react-focus-scope`'s scope stack. Two installed versions are two
 * stacks that cannot see each other.
 *
 * THE DEFECT: the lockfile carried dismissable-layer 1.1.19 (under
 * react-dialog 1.1.23 — every Dialog and the vaul Drawer) and 1.1.20 (under
 * react-popover 1.2.0). A modal sheet set `pointer-events: none` on <body>
 * through one stack; a Popover opened inside it lived in the other, never
 * learned it sat above the sheet, never turned its own pointer events back
 * on — so at 375px a tap on "Create one" in the reference picker's "Change…"
 * list fell THROUGH the popover onto the search box under it, and the list
 * closed with nothing chosen. The class: any popover, menu or picker opened
 * inside any dialog or sheet.
 *
 * The fix is `pnpm.overrides` in package.json pinning both to one version.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LOCK = readFileSync(join(__dirname, "..", "..", "..", "pnpm-lock.yaml"), "utf8");

/** Every resolved version of a package in the lockfile's `packages:` index. */
function versionsOf(name: string): string[] {
  const escaped = name.replace(/[/@.-]/g, (c) => `\\${c}`);
  const re = new RegExp(`^  '${escaped}@([^'(]+)':$`, "gm");
  return [...new Set([...LOCK.matchAll(re)].map((m) => m[1]))].sort();
}

describe("one Radix layer stack", () => {
  it.each([
    "@radix-ui/react-dismissable-layer",
    "@radix-ui/react-focus-scope",
  ])("%s resolves to exactly one version", (name) => {
    const versions = versionsOf(name);
    expect({ name, versions: versions.length }).toEqual({ name, versions: 1 });
  });
});
