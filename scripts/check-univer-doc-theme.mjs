#!/usr/bin/env node
/**
 * check-univer-doc-theme.mjs — a Univer DOCUMENT surface may not be left
 * wearing Univer's hardcoded light page, and may not hand the renderer a
 * colour the renderer cannot paint.
 *
 * ─── THE CLASS, TWICE ───────────────────────────────────────────────────────
 * WALK 18 (production, dark, 2026-09-21): a Rulebook's "Add more → New
 * document" rendered the sheet as a BLACK rectangle inside a BRIGHT frame —
 * `rgb(0, 0, 0)` inside `rgb(250, 250, 250)`.
 *
 * WALK 19 (same screen, after the first fix): the page rendered as NOTHING —
 * a 1396x684 canvas, 0.00% non-background pixels, silently swallowing a
 * 519-character paragraph that was being saved the whole time (light mode,
 * reloaded, showed it sitting on the paper).
 *
 * ─── THE ROOT CAUSE, IN THREE PARTS ─────────────────────────────────────────
 * 1. `@univerjs/docs-ui` contains ZERO references to `darkMode`, and
 *    `@univerjs/engine-render`'s `DocBackground` paints the desk and the paper
 *    from four module-level LIGHT constants. `univerAPI.toggleDarkMode()`
 *    recolours Univer's CHROME and stops there. A host that pushes nothing
 *    does not get "the default" — it gets whatever Univer happens to hold.
 * 2. Every `ctx.fillStyle = <string>` on Univer's rendering context goes
 *    through `ICanvasColorService.getRenderColor()`, which in dark mode
 *    INVERTS the colour. State "the page is white paper" and the canvas paints
 *    black — walk 18, exactly.
 * 3. That same method calls `new ColorKit(color)` on anything that is not hex
 *    / rgb / rgba, and ColorKit's `hslToColor` THROWS on the space-separated
 *    `hsl(240 4% 16%)` form this app's design tokens are written in. The throw
 *    is raised inside the fillStyle setter — inside the render pass — so the
 *    whole draw aborts and the canvas is left as `clearRect` left it. Walk 19.
 *
 * ─── THE RULES THIS ENFORCES ────────────────────────────────────────────────
 * A. Every file that boots a Univer document (`createUniver(` together with
 *    `UniverDocsCorePreset`) consumes `useUniverDocSurfaceTheme` — the ONE
 *    hook that states all four fills and the canvas background from this app's
 *    theme tokens.
 * B. …and `renderDocumentCanvasColorsVerbatim`, which takes the inverting
 *    colour service off that instance's canvas. Without it the host's paper is
 *    inverted to black and the ink with it.
 * C. Every colour the theme module produces, in BOTH themes, survives Univer's
 *    OWN `ColorKit` (imported here from `@univerjs/core` — the real vendor
 *    code that threw, not a description of it) and satisfies the page/frame
 *    luminance invariant.
 *
 * Usage:
 *   pnpm check:univer-doc-theme             # sweep + the colour engine check
 *   pnpm check:univer-doc-theme --self-test # plant each defect, prove it fails
 *
 * Exit: 0 clean · 1 finding(s) · 3 self-test failed
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.slice(2).includes("--self-test");

/** The hook that states the four fills and the canvas background. */
const REQUIRED_HOOK = "useUniverDocSurfaceTheme";
/** The call that takes the dark-mode colour inversion off the canvas. */
const REQUIRED_VERBATIM = "renderDocumentCanvasColorsVerbatim";
/** The hook that is NOT enough on its own — chrome only. */
const CHROME_ONLY_HOOK = "useUniverDarkModeSync";

/**
 * Does this source boot a Univer DOCUMENT? Sheets have their own theming path
 * and are not judged here.
 *
 * Exported so the self-test drives the same predicate the sweep does.
 */
export function bootsUniverDocument(source) {
  return (
    /\bcreateUniver\s*\(/.test(source) && /\bUniverDocsCorePreset\b/.test(source)
  );
}

/** @returns {{kind:string, detail:string}[]} */
export function findUniverDocThemeGaps(source) {
  if (!bootsUniverDocument(source)) return [];
  const findings = [];
  // A CALL, not a mention. An import left behind by a deleted call is exactly
  // the shape a careless revert leaves, and it used to satisfy this guard.
  const calls = (name) => new RegExp(`\\b${name}\\s*\\(`).test(source);
  if (!calls(REQUIRED_HOOK)) {
    findings.push({
      kind: "univer-document-without-theme",
      detail: source.includes(CHROME_ONLY_HOOK)
        ? `boots a Univer document and syncs ${CHROME_ONLY_HOOK} (Univer's CHROME) but never ${REQUIRED_HOOK}, so the PAGE keeps Univer's hardcoded light fills`
        : `boots a Univer document and never consumes ${REQUIRED_HOOK}, so the page and the frame keep Univer's hardcoded light fills in every theme`,
    });
  }
  if (!calls(REQUIRED_VERBATIM)) {
    findings.push({
      kind: "univer-document-without-verbatim-canvas-colors",
      detail: `boots a Univer document and never calls ${REQUIRED_VERBATIM}, so Univer's dark-mode CanvasColorService still sits between the stated colours and the canvas — it inverts the paper to black and throws the whole draw away on any colour its ColorKit cannot parse`,
    });
  }
  return findings;
}

// ─── C. the colour check, driven through Univer's OWN ColorKit ──────────────

/**
 * Judge every colour the app would hand the renderer, in both themes, using
 * the vendor code that actually failed.
 *
 * `CanvasColorService` itself cannot be imported outside a browser (its
 * package pulls `opentype.js`), so this reproduces its dark-mode branch from
 * the two `@univerjs/core` primitives it is built out of — `ColorKit`, whose
 * constructor threw, and `invertColorByMatrix`, which turned the paper black.
 * Nothing here is a description of Univer's behaviour; it is Univer's code.
 *
 * @returns {Promise<string[]>} every violation, empty when clean
 */
export async function findColorEngineViolations(colorsByMode) {
  const { ColorKit, invertColorByMatrix } = await import("@univerjs/core");
  const { univerDocSurfaceViolations } = await import(
    "../features/data-tables/univer-doc-surface-theme.ts"
  );
  const violations = [];

  for (const [mode, colors] of Object.entries(colorsByMode)) {
    violations.push(...univerDocSurfaceViolations(mode, colors));

    for (const [slot, value] of Object.entries(colors)) {
      // THE WALK 19 SHAPE. `CanvasColorService.getRenderColor` reaches
      // `new ColorKit(color)` for anything that is not hex / rgb / rgba, and
      // ColorKit's constructor THROWS rather than reporting invalid. In the
      // browser that throw happens inside `set fillStyle`, i.e. inside the
      // render pass, and the page comes out empty.
      let kit;
      try {
        kit = new ColorKit(value);
      } catch (err) {
        violations.push(
          `${mode}: ${slot} = "${value}" — Univer's own ColorKit THROWS on it (${err instanceof Error ? err.message : String(err)}). In the browser that throw is raised inside ctx.fillStyle, inside the render pass, and the whole page renders blank (cold walk 19).`,
        );
        continue;
      }
      if (!kit.isValid) {
        violations.push(
          `${mode}: ${slot} = "${value}" — Univer's own ColorKit reports it invalid, so CanvasColorService cannot render it`,
        );
      }
    }

    // THE WALK 18 SHAPE, stated as the reason rule B exists: leave the
    // inverting service in place and the paper the host asked for is painted
    // near-black. Proven here on the real `invertColorByMatrix`.
    const page = new ColorKit(colors.page).toRgb();
    const inverted = invertColorByMatrix([page.r, page.g, page.b]);
    const invertedLuminance =
      (0.2126 * inverted[0] + 0.7152 * inverted[1] + 0.0722 * inverted[2]) / 255;
    if (mode === "dark" && invertedLuminance > 0.5) {
      violations.push(
        `dark: the page (${colors.page}) survives Univer's dark-mode inversion looking like paper — which means the inversion is no longer the hazard ${REQUIRED_VERBATIM} exists for. Re-read that module before relaxing anything.`,
      );
    }
  }

  return violations;
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__") && !/\.test\.tsx?$/.test(f));
}

async function selfTest() {
  const fixed = `
    const { univer, univerAPI } = createUniver({
      theme: defaultTheme,
      darkMode: darkModeRef.current,
      presets: [UniverDocsCorePreset({ container, ribbonType: "simple" })],
    });
    renderDocumentCanvasColorsVerbatim(univer.__getInjector());
    useUniverDarkModeSync(apiRef, bootState === "ready");
    useUniverDocSurfaceTheme(univerRef, unitId ?? "", ready);
  `;

  // 1. THE WALK 18 EDITOR: dark mode synced, page never told anything.
  const walk18 = findUniverDocThemeGaps(
    fixed
      .replace(`useUniverDocSurfaceTheme(univerRef, unitId ?? "", ready);`, "")
      .replace("renderDocumentCanvasColorsVerbatim(univer.__getInjector());", ""),
  );

  // 2. THE WALK 19 EDITOR: colours stated, inverter still on the canvas.
  const walk19 = findUniverDocThemeGaps(
    fixed.replace(
      "renderDocumentCanvasColorsVerbatim(univer.__getInjector());",
      "",
    ),
  );

  // 3. Not a Univer document — a sheet, and a file that merely names Univer.
  const sheet = findUniverDocThemeGaps(`
    createUniver({ presets: [UniverSheetsCorePreset({ container })] });
  `);
  const prose = findUniverDocThemeGaps(
    `// UniverDocsCorePreset is heavy, so the canvas pane lazy-loads it.`,
  );

  // 4. THE COLOUR ENGINE. The exact strings shipped on 2026-09-21 — the app's
  //    tokens passed through as space-separated hsl — must be caught, and the
  //    colours this repo produces today must be clean.
  const { univerDocSurfaceColors } = await import(
    "../features/data-tables/univer-doc-surface-theme.ts"
  );
  const plantedColors = await findColorEngineViolations({
    dark: {
      frame: "hsl(240 4% 16%)",
      page: "rgb(245, 245, 247)",
      pageStroke: "hsl(240 4% 30%)",
      marginStroke: "rgba(158, 158, 158, 1)",
    },
  });
  const blackPage = await findColorEngineViolations({
    dark: {
      frame: "rgb(39, 39, 42)",
      page: "rgb(0, 0, 0)",
      pageStroke: "rgb(69, 69, 74)",
      marginStroke: "rgba(158, 158, 158, 1)",
    },
  });
  const liveColors = await findColorEngineViolations({
    light: univerDocSurfaceColors("light", () => ""),
    dark: univerDocSurfaceColors("dark", () => ""),
  });

  const checks = {
    "walk-18 editor flagged for the missing hook": walk18.some(
      (f) => f.kind === "univer-document-without-theme",
    ),
    "walk-18 editor flagged for the missing verbatim override": walk18.some(
      (f) => f.kind === "univer-document-without-verbatim-canvas-colors",
    ),
    "walk-18 editor's hook finding names CHROME": walk18.some((f) =>
      f.detail.includes("CHROME"),
    ),
    "walk-19 editor flagged for the inverter alone": walk19.length === 1,
    "a sheets preset is not flagged": sheet.length === 0,
    "a prose mention is not flagged": prose.length === 0,
    "the shipped hsl() colours are caught by Univer's ColorKit":
      plantedColors.some((v) => v.includes("ColorKit THROWS")),
    "a black page is caught by the luminance invariant": blackPage.some((v) =>
      v.includes("too dark for the black ink"),
    ),
    "the colours this repo produces today are clean": liveColors.length === 0,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("check-univer-doc-theme self-test FAILED");
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    console.error({ walk18, walk19, plantedColors, blackPage, liveColors });
    process.exit(3);
  }
  for (const name of Object.keys(checks)) console.log(`  ✓ ${name}`);
  console.log(
    "check-univer-doc-theme self-test: both cold walks' editors are caught by the sweep, and both cold walks' COLOURS are caught by Univer's own ColorKit and the luminance invariant.",
  );
  process.exit(0);
}

if (SELF_TEST) await selfTest();

const files = trackedFiles();
let total = 0;
let documentSurfaces = 0;
for (const rel of files) {
  let source;
  try {
    source = readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    continue; // deleted in worktree
  }
  if (bootsUniverDocument(source)) documentSurfaces++;
  for (const finding of findUniverDocThemeGaps(source)) {
    total++;
    console.log(`${rel}  ${finding.kind}: ${finding.detail}`);
  }
}

const { univerDocSurfaceColors } = await import(
  "../features/data-tables/univer-doc-surface-theme.ts"
);
const colorViolations = await findColorEngineViolations({
  light: univerDocSurfaceColors("light", () => ""),
  dark: univerDocSurfaceColors("dark", () => ""),
});
for (const violation of colorViolations) {
  total++;
  console.log(`features/data-tables/univer-doc-surface-theme.ts  ${violation}`);
}

if (total === 0) {
  console.log(
    `check-univer-doc-theme: ${documentSurfaces} Univer document surface(s), every one of them stating its page and frame colours through ${REQUIRED_HOOK} and rendering them verbatim through ${REQUIRED_VERBATIM}; both themes' colours survive Univer's own ColorKit.`,
  );
  process.exit(0);
}
console.error(
  `\ncheck-univer-doc-theme: ${total} finding(s). A document surface must consume ${REQUIRED_HOOK} AND ${REQUIRED_VERBATIM} (features/data-tables/), and every colour it states must be one Univer's ColorKit can parse — hex, or rgb/rgba/hsl/hsla with COMMAS. ${CHROME_ONLY_HOOK} only reaches Univer's chrome.`,
);
process.exit(1);
