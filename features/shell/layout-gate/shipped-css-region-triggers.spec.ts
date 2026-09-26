/**
 * LAYOUT GATE — a stylesheet the app SHIPS may never collapse a wrapped
 * right-click region, a text field, or an icon nested inside one.
 *
 * THE LIVE DEFECT (2026-09-26, ~90 minutes app-wide): ContextMenuV3 began
 * stamping `data-alchemy-trigger="context"` onto every region it wraps. The
 * installed `@ai-matrx/design-system@0.44.1` `dist/content-transfer.css` carried
 * `[data-alchemy-trigger] { width: 2rem; height: 2rem }` (meant for its own
 * icon buttons), UNLAYERED — so it beat every Tailwind `w-full` in
 * `@layer utilities`. The /chat composer collapsed to ~32px (its placeholder
 * wrapped one letter per line) and every sidebar chat name clipped to one
 * letter. jsdom computes no layout and the other specs here load only
 * `styles/shell.css`, so nothing saw it.
 *
 * WHAT THIS LOADS: the REAL package CSS the app imports — derived, never
 * hand-listed: every `import "@ai-matrx/…​.css"` in tracked non-test .ts/.tsx
 * and every `@import "@ai-matrx/…"` in tracked .css, resolved through Node
 * exactly as the bundler does, with each file's own `@import`s inlined
 * recursively. Then `styles/shell.css`. The Tailwind utilities the fixtures use
 * sit in `@layer utilities`, as Tailwind v4 emits them, because layer order is
 * the whole mechanism of this class.
 *
 * WHAT IT RENDERS: each fixture twice — once with
 * `CONTEXT_REGION_TRIGGER_ATTRS` (the object ContextMenuV3 itself spreads, so
 * the fixture cannot drift from production) and once without — and requires
 * the two to measure the same. Any shipped rule keyed on those attributes that
 * changes a region's box or a nested icon's paint goes red here.
 *
 * Proven failing before passing (2026-09-26): with
 * `MATRX_LAYOUT_GATE_CSS_OVERRIDE=@ai-matrx/design-system=<0.44.1 dist dir>`
 * every case goes RED (composer 32px vs its natural width, sidebar row 32px vs
 * 240px, nested icon 18px vs 14px); on the installed 0.44.3 every case is green.
 *
 * Override format: comma-separated `<package>=<absolute dist dir>` pairs. A file
 * resolved inside that package's installed `dist/` is read from the override
 * dir instead (same relative path). The run announces every override.
 *
 * Run: pnpm test:shell-layout
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { CONTEXT_REGION_TRIGGER_ATTRS } from "../../context-menu-v3/region-trigger-attrs";

const ROOT = process.cwd();
const requireFromRoot = createRequire(path.join(ROOT, "package.json"));

/** `@ai-matrx/<name>` → override dist dir, from MATRX_LAYOUT_GATE_CSS_OVERRIDE. */
const OVERRIDES = new Map<string, string>(
  (process.env.MATRX_LAYOUT_GATE_CSS_OVERRIDE ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.lastIndexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)] as [string, string];
    }),
);

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Maps an installed package file onto its override, when one is set. */
function readWithOverride(resolved: string): { file: string; css: string } {
  const m = /[\\/]node_modules[\\/](@ai-matrx[\\/][^\\/]+)[\\/]dist[\\/](.+)$/.exec(resolved);
  if (m) {
    const pkg = m[1].replace(/\\/g, "/");
    const override = OVERRIDES.get(pkg);
    if (override) {
      const file = path.join(override, m[2]);
      return { file, css: readFileSync(file, "utf8") };
    }
  }
  return { file: resolved, css: readFileSync(resolved, "utf8") };
}

/** Reads a stylesheet and inlines its `@import`s (relative and package). */
function inlineCss(resolved: string, seen: Set<string>, sources: string[]): string {
  if (seen.has(resolved)) return "";
  seen.add(resolved);
  const { file, css } = readWithOverride(resolved);
  sources.push(path.relative(ROOT, file).startsWith("..") ? file : path.relative(ROOT, file));
  const body = stripComments(css);
  return body.replace(/@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;/g, (_all, spec: string) => {
    if (spec.startsWith(".")) {
      return inlineCss(path.join(path.dirname(resolved), spec), seen, sources);
    }
    if (spec.startsWith("@ai-matrx/")) {
      return inlineCss(requireFromRoot.resolve(spec), seen, sources);
    }
    // `tailwindcss` & co. are build-time directives, not shipped bytes.
    return "";
  });
}

/** Every `@ai-matrx/*.css` specifier the app imports, in first-seen order. */
function shippedPackageCssSpecifiers(): string[] {
  const grep = (pattern: string, globs: string[]) => {
    try {
      return execFileSync("git", ["grep", "-nE", pattern, "--", ...globs], {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return "";
    }
  };
  // app/layout.tsx first: it is the root import order the app actually ships.
  const tsHits = grep(`^import ['"]@ai-matrx/[^'"]+\\.css['"]`, [
    "*.ts",
    "*.tsx",
    ":!*.test.ts",
    ":!*.test.tsx",
    ":!*.spec.ts",
  ])
    .split("\n")
    .filter(Boolean)
    .sort((a, b) => Number(!a.startsWith("app/layout.tsx:")) - Number(!b.startsWith("app/layout.tsx:")));
  const cssHits = grep(`^@import ['"]@ai-matrx/[^'"]+['"]`, ["*.css"]).split("\n").filter(Boolean);
  const specs: string[] = [];
  for (const line of [...tsHits, ...cssHits]) {
    const spec = /["'](@ai-matrx\/[^"']+)["']/.exec(line)?.[1];
    if (spec && !specs.includes(spec)) specs.push(spec);
  }
  return specs;
}

const SPECIFIERS = shippedPackageCssSpecifiers();
const SOURCES: string[] = [];
const SEEN = new Set<string>();
const PACKAGE_CSS = SPECIFIERS.map((spec) => inlineCss(requireFromRoot.resolve(spec), SEEN, SOURCES)).join("\n");
const SHELL_CSS = readFileSync(path.join(ROOT, "styles", "shell.css"), "utf8");

/** Tailwind v4 emits utilities into `@layer utilities` — the loser to any unlayered rule. */
const TAILWIND_UTILITIES = `
@layer base { * { box-sizing: border-box; margin: 0; } }
@layer utilities {
  .grid { display: grid; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .w-full { width: 100%; }
  .min-w-0 { min-width: 0; }
  .resize-none { resize: none; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .px-2 { padding-left: .5rem; padding-right: .5rem; }
  .py-1 { padding-top: .25rem; padding-bottom: .25rem; }
}`;

const ATTRS = Object.entries(CONTEXT_REGION_TRIGGER_ATTRS)
  .map(([k, v]) => `${k}="${v}"`)
  .join(" ");

/** The fixtures; `a` is the region-trigger attribute string or "". */
const FIXTURE = (a: string) => `
<div style="width: 1040px; display: flex; gap: 0;">
  <nav data-testid="sidebar" style="width: 240px; flex-shrink: 0;">
    <a href="#" ${a} class="flex items-center w-full truncate px-2 py-1" data-testid="sidebar-row">Quarterly pickup routes for the Riverside recycling yard</a>
  </nav>
  <section style="flex: 1; min-width: 0;">
    <div class="grid" data-testid="composer" style="grid-template-columns: 1fr auto; gap: 8px; width: 720px;">
      <textarea ${a} class="w-full min-w-0 resize-none" rows="2" data-testid="composer-input" placeholder="Ask about this week's pickups…"></textarea>
      <button type="button">Send</button>
    </div>
    <div ${a} data-testid="message-region" style="width: 720px;">
      <p>Tuesday's route skips the Harbor Street depot.</p>
      <button type="button" class="matrx-tap" style="color: rgb(12, 90, 200);" data-testid="tap-button">
        <svg class="matrx-tap-icon" data-testid="tap-icon" viewBox="0 0 24 24"><path d="M4 12h16" stroke="currentColor"/></svg>
      </button>
    </div>
  </section>
</div>`;

async function measure(page: import("@playwright/test").Page, attrs: string) {
  await page.setContent(`<!doctype html><html><head></head><body>${FIXTURE(attrs)}</body></html>`);
  await page.addStyleTag({ content: TAILWIND_UTILITIES });
  await page.addStyleTag({ content: PACKAGE_CSS });
  await page.addStyleTag({ content: SHELL_CSS });
  return page.evaluate(() => {
    const box = (id: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    };
    const icon = document.querySelector('[data-testid="tap-icon"]') as SVGElement;
    const s = getComputedStyle(icon);
    return {
      sidebarRow: box("sidebar-row"),
      composerInput: box("composer-input"),
      messageRegion: box("message-region"),
      icon: { ...box("tap-icon"), color: s.color, strokeWidth: s.strokeWidth },
    };
  });
}

test.describe("shipped package CSS never reshapes a context-menu region", () => {
  test("the shipped CSS stack was actually found", () => {
    // UNMEASURED is a failure: an empty stack would make every case below vacuous.
    expect(SPECIFIERS.length, "no `@ai-matrx/*.css` import found in the app").toBeGreaterThan(0);
    for (const src of SOURCES) expect(existsSync(path.resolve(ROOT, src)), src).toBe(true);
    expect(
      SOURCES.some((s) => s.endsWith("content-transfer.css")),
      `content-transfer.css not in the derived stack: ${SOURCES.join(", ")}`,
    ).toBe(true);
    if (OVERRIDES.size) console.log(`[layout-gate] CSS OVERRIDE active: ${[...OVERRIDES].map(([k, v]) => `${k}=${v}`).join(", ")}`);
    const short = (f: string) => f.replace(/^.*node_modules[\\/](@ai-matrx[\\/])/, "$1");
    console.log(`[layout-gate] shipped CSS stack (${SOURCES.length}): ${SOURCES.map(short).join(", ")}`);
  });

  // One test per fixture, so each class member goes red on its own.
  const REGIONS = [
    ["sidebarRow", "a sidebar chat row keeps the sidebar's width"],
    ["composerInput", "the composer textarea keeps its grid column's width"],
    ["messageRegion", "a wrapped message region keeps its width"],
  ] as const;
  for (const [key, title] of REGIONS) {
    test(`${title} when it carries the region trigger attributes`, async ({ page }) => {
      const baseline = await measure(page, "");
      const wrapped = await measure(page, ATTRS);
      // The baseline is the natural layout, not a collapsed one.
      expect(baseline.sidebarRow.width).toBeCloseTo(240, 0);
      expect(baseline.composerInput.width).toBeGreaterThan(400);
      expect(
        Math.abs(wrapped[key].width - baseline[key].width),
        `${key} width: ${wrapped[key].width}px with the region attrs vs ${baseline[key].width}px without`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(wrapped[key].height - baseline[key].height),
        `${key} height: ${wrapped[key].height}px with the region attrs vs ${baseline[key].height}px without`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("a tap-button icon nested inside a region paints exactly as outside one", async ({ page }) => {
    const baseline = await measure(page, "");
    const wrapped = await measure(page, ATTRS);
    expect(wrapped.icon, "nested .matrx-tap-icon size/color/stroke inside a region vs outside").toEqual(baseline.icon);
  });
});
