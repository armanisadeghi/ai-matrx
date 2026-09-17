// 🚨 A DOCKED PANEL CLEARS THE SHELL HEADER — WITH THE SHELL'S OWN HEIGHT.
//
// D3 (VERIFY-U-P1) fixed the missing offset by padding `SidePanelSurface`'s
// fixed container with `--header-height`. That token is 2.5rem and belongs to
// the pre-shell ResponsiveLayout pages; the app shell's header is
// `--shell-header-h`, 2.75rem. So every panel built on this surface still drew
// its title row 4px over the shell header's right-hand cluster — the org
// switcher, search and avatar (Bugbot, frontend PR 228, commit 4cbd9e45).
//
// WHAT THIS TEST CAN AND CANNOT SEE. jsdom does not lay out, resolve a custom
// property or run `body:has()`, so nothing here measures pixels and NO SCREEN
// WAS SEEN for this fix. What it does assert is the whole chain of declared
// truth the browser then resolves: the class the surface emits, the ONE token
// that carries the shell header's height, and that the admin tree's different
// value is declared exactly ONCE, on <body>, so it reaches both the shell
// subtree and the panels portaled out of it (`#glass-layer`).

import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel: string): string =>
  readFileSync(path.join(process.cwd(), rel), "utf8");

/** Strip comments so the prose explaining these rules cannot satisfy them. */
const stripCss = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const SURFACE = read("features/overlays/surfaces/SidePanelSurface.tsx");
const SHELL_CSS = stripCss(read("styles/shell.css"));
const GLOBALS_CSS = stripCss(read("app/globals.css"));

describe("SidePanelSurface's header clearance", () => {
  it("reserves the shell header token on the fixed panel container", () => {
    expect(SURFACE).toContain('className={cn("z-40 pt-[var(--shell-header-h,0px)]")}');
  });

  it("never reserves the legacy ResponsiveLayout header token", () => {
    // The 4px overlap in one assertion: this surface must not READ the token
    // whose value is not the shell header's height. The explanatory comment
    // above the class names that token, so only the `var(` read is banned.
    expect(SURFACE.replace(/\/\/.*$/gm, "")).not.toContain("var(--header-height");
  });
});

describe("the ONE truth for the shell header's height", () => {
  it("is --shell-header-h, declared once at :root in the shell sheet", () => {
    expect(SHELL_CSS).toMatch(/:root\s*\{[^}]*--shell-header-h:\s*2\.75rem;/);
    // `--header-height` still exists and is still 2.5rem — that is exactly why
    // it is the wrong token to pad a (core) shell panel with.
    expect(GLOBALS_CSS).toMatch(/--header-height:\s*2\.5rem;/);
  });

  it("carries the legacy admin height in exactly ONE declaration", () => {
    const declarations = SHELL_CSS.match(/--shell-header-h:\s*2\.5rem;/g) ?? [];
    expect(declarations).toHaveLength(1);
  });

  it("declares that one on <body>, so it crosses the portal to #glass-layer", () => {
    // MatrxDynamicPanelHost portals into #glass-layer, a child of <body>
    // outside .shell-root, so a value on `.shell-root` would hand the panel
    // :root's 2.75rem under a 2.5rem admin header. A <body> declaration is
    // inherited by both, from one place.
    expect(SHELL_CSS).toMatch(
      /body:has\(\.shell-root\[data-pathname\^="\/administration"\]\)\s*\{\s*--shell-header-h:\s*2\.5rem;\s*\}/,
    );
    expect(SHELL_CSS).not.toMatch(
      /\.shell-root\[data-pathname\^="\/administration"\]\s*\{\s*--shell-header-h/,
    );
  });
});
