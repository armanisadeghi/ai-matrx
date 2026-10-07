/**
 * THE TOP BOUNDARY — the header band and where the page meets it are owned
 * ONCE, by the shell, and no route can change them.
 *
 * THE RULING (owner, 2026-10-03):
 *   - The header band is painted solid, so nothing shows through it; by the
 *     tap-target rule "glass only floats" the header is NOT glass. Every
 *     control in it — back, breadcrumbs, the right-side set — is transparent.
 *   - NO border under the header.
 *   - A very small fade where content meets the header: an overlay a few px
 *     tall, absolutely positioned below the header, pointer-events off, ZERO
 *     layout space.
 *   - That boundary is rendered by ONE element in the shell's `Header`; route
 *     header slots cannot style the band, and no route adds its own border,
 *     fade, shadow or solid strip under the header.
 *
 * PROVEN FAILING BEFORE PASSING (2026-10-03): against the previous commit's
 * `styles/shell.css`, `Header.tsx`, `HeaderControlSet.tsx`,
 * `CrumbTrailHeader.tsx` and `EntityModeHeader.tsx` (a 1rem tail painted by
 * `::before`, clearance that added the tail, no fade element, glass canvas
 * toggle, glass back + crumb capsules) → 6 of 8 RED. The two "no border /
 * no band" cases held there too; planting `border-b` on the crumb nav and
 * `.shell-header { box-shadow }` in shell.css turns both RED. All 8 GREEN now.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");

const SHELL_CSS = "styles/shell.css";
const HEADER = "features/shell/components/header/Header.tsx";

/** Every `selector { declarations }` block, innermost (works inside @media). */
function cssBlocks(css: string): { selector: string; body: string }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: { selector: string; body: string }[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    blocks.push({ selector: m[1].trim(), body: m[2] });
  }
  return blocks;
}

function block(css: string, selector: string): string {
  const found = cssBlocks(css).find((b) => b.selector === selector);
  if (!found) throw new Error(`no CSS block for ${selector}`);
  return found.body;
}

function toPx(value: string): number {
  const v = value.trim();
  if (v.endsWith("rem")) return parseFloat(v) * 16;
  if (v.endsWith("px")) return parseFloat(v);
  throw new Error(`unparsed length ${v}`);
}

// The files that draw INTO the header row. The band is never theirs.
const HEADER_SLOT_FILES = [
  HEADER,
  "features/shell/components/header/HeaderControlSet.tsx",
  "features/shell/components/header/PageHeader.tsx",
  "features/shell/components/header/PageHeaderPortal.tsx",
  "features/shell/components/header/PageHeaderRightPortal.tsx",
  "features/shell/components/header/RouteHeader.tsx",
  "features/shell/components/header/route-header-layout.tsx",
  "features/shell/components/header/RouteModeNav.tsx",
  "features/shell/components/header/templates/CrumbTrailHeader.tsx",
  "features/shell/components/header/templates/EntityModeHeader.tsx",
  "features/shell/components/header/templates/RouteTreeBreadcrumbHeader.tsx",
];

// The shell's own header controls, wherever they live.
const HEADER_CONTROL_FILES = [
  ...HEADER_SLOT_FILES,
  "features/shell/components/header/HeaderPhoneOverflow.tsx",
  "features/shell/components/header/ShellChatToggle.tsx",
  "features/shell/components/header/header-left-menu/HamburgerButton.tsx",
  "features/shell/components/header/templates/MobilePanelShell.tsx",
  "features/knowledge/command-bar/OpenCommandBarButtons.tsx",
  "features/messaging/components/shell/MessagesHeaderButton.tsx",
  "features/notifications/components/InboxHeaderButton.tsx",
  "../aidream/apps/shared/chat/src/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx",
];

describe("the header band", () => {
  const css = read(SHELL_CSS);

  it("is solid and exactly the header's own box — no tail painted by the band", () => {
    const band = block(css, ".shell-header::before");
    expect(band).toMatch(/inset:\s*0/);
    expect(band).not.toMatch(/\bbottom:/);
    expect(band).not.toMatch(/gradient/);
    expect(band).toMatch(/background:\s*hsl\(var\(--background\)\)/);
  });

  it("has no border and no shadow under it — from any stylesheet", () => {
    const sheets = execSync("git ls-files -- '*.css'", { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.includes("node_modules"));
    const offenders: string[] = [];
    for (const sheet of sheets) {
      for (const { selector, body } of cssBlocks(read(sheet))) {
        // The header itself, its band pseudo, or its fade — never a child slot.
        const targetsBand = selector
          .split(",")
          .some((s) => /\.shell-header(::?(before|after))?\s*$/.test(s.trim()) || /\.shell-header-fade\s*$/.test(s.trim()));
        if (!targetsBand) continue;
        if (/border(-bottom|-block-end)?\s*:(?!\s*(0|none)\b)|box-shadow\s*:(?!\s*none\b)/.test(body)) {
          offenders.push(`${sheet}: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the one fade", () => {
  const css = read(SHELL_CSS);

  it("is a few px tall and takes ZERO layout space", () => {
    const root = cssBlocks(css).find((b) => b.selector === ":root" && b.body.includes("--shell-header-fade-h"));
    const fadeH = toPx(/--shell-header-fade-h:\s*([^;]+);/.exec(root!.body)![1]);
    expect(fadeH).toBeGreaterThanOrEqual(4);
    expect(fadeH).toBeLessThanOrEqual(8);
    // Nothing clears the fade: it sits OVER the page, never pushes it.
    for (const { body } of cssBlocks(css)) {
      const clearance = /--shell-header-clearance:\s*([^;]+);/.exec(body);
      if (clearance) expect(clearance[1]).not.toContain("fade");
    }
  });

  it("is absolutely positioned below the header with pointer events off", () => {
    const fade = block(css, ".shell-header > .shell-header-fade");
    expect(fade).toMatch(/position:\s*absolute/);
    expect(fade).toMatch(/top:\s*100%/);
    expect(fade).toMatch(/height:\s*var\(--shell-header-fade-h\)/);
    expect(fade).toMatch(/pointer-events:\s*none/);
  });

  it("is rendered by the shell's Header, once, and by nothing else", () => {
    const header = read(HEADER);
    expect(header.match(/className="shell-header-fade"/g)).toHaveLength(1);
    const elsewhere = execSync(
      "git grep -l -E 'shell-header-fade\"|data-shell-header-fade' -- '*.tsx' '*.ts' ':!*.test.*' ':!**/__tests__/**' || true",
      { cwd: REPO, encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    expect(elsewhere).toEqual([HEADER]);
  });
});

describe("route header slots cannot draw the boundary", () => {
  it("no header-slot file paints a border, shadow or solid band", () => {
    const offenders: string[] = [];
    for (const file of HEADER_SLOT_FILES) {
      read(file)
        .split("\n")
        .forEach((line, i) => {
          if (!/className|class=/.test(line) && !/^\s*"[^"]*"\s*,?\s*$/.test(line)) return;
          // Bottom-sheet rows (52px) live in a drawer, not in the header row.
          if (line.includes("min-h-[52px]")) return;
          if (/\b(border-b|shadow-(sm|md|lg|xl|2xl)|shadow\b|bg-(background|card|textured)|backdrop-blur)/.test(line)) {
            offenders.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("the header is not glass (glass only floats; the band is solid)", () => {
  it("every shell header control is transparent", () => {
    const offenders: string[] = [];
    for (const file of HEADER_CONTROL_FILES) {
      // Code only — a usage example in a comment is not a rendered control.
      const src = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // A raw TapTargetButton IS glass.
      if (/<TapTargetButton[\s>]/.test(src)) offenders.push(`${file}: raw <TapTargetButton> (glass default)`);
      if (/variant="(glass|group)"/.test(src)) offenders.push(`${file}: variant glass/group`);
      if (/data-matrx-glass(?!-plane)/.test(src)) offenders.push(`${file}: data-matrx-glass`);
      if (/matrx-glass-(thin-border|interactive)/.test(src)) offenders.push(`${file}: glass surface class`);
      // A pre-composed *TapButton must say transparent (its default is glass).
      for (const m of src.matchAll(/<([A-Z][A-Za-z]*TapButton)\b([^>]*?)\/?>/gs)) {
        if (!/variant="transparent"/.test(m[2])) offenders.push(`${file}: <${m[1]}> without variant="transparent"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the canvas toggle in the set says transparent", () => {
    expect(read("features/shell/components/header/HeaderControlSet.tsx")).toContain(
      '<CanvasToggle variant="transparent" />',
    );
  });
});
