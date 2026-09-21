#!/usr/bin/env node
/**
 * check-univer-doc-theme.mjs — a Univer DOCUMENT surface may not be left
 * wearing Univer's hardcoded light page.
 *
 * THE CLASS (cold walk 18, production, 2026-09-21): a Rulebook's
 * "Add more → New document" opened the word processor and, in the app's own
 * dark theme, rendered the sheet as a black rectangle inside a bright frame —
 * measured `rgb(0, 0, 0)` on the editing surface inside `rgb(250, 250, 250)`.
 *
 * THE ROOT CAUSE: `@univerjs/docs-ui` contains ZERO references to `darkMode`
 * or the theme service, and `@univerjs/engine-render`'s `DocBackground` paints
 * the desk and the paper from four module-level LIGHT constants
 * (`DOCS_WORKSPACE_FILL_COLOR = "#fafafa"`, `PAGE_FILL_COLOR = white`, …),
 * while `DocsRenderService` pins the canvas element's CSS background to
 * `#fafafa` once, at create time. `univerAPI.toggleDarkMode()` recolours
 * Univer's CHROME and stops there. So the ONLY input to the page's colours is
 * what the HOST pushes in. A host that pushes nothing does not get "the
 * default" — it gets whatever Univer happens to hold, in whatever theme.
 *
 * THE RULE: every file that boots a Univer document (`createUniver(` together
 * with `UniverDocsCorePreset`) must also consume `useUniverDocSurfaceTheme`,
 * the ONE hook that states all four fills and the canvas background from this
 * app's theme tokens. That is what keeps the fix at the editor rather than at
 * each of the surfaces that embed it.
 *
 * Usage:
 *   pnpm check:univer-doc-theme             # sweep the tracked tree
 *   pnpm check:univer-doc-theme --self-test # plant the class, prove it fails
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

/** The hook that is the whole point. */
const REQUIRED_HOOK = "useUniverDocSurfaceTheme";
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
  if (source.includes(REQUIRED_HOOK)) return [];
  return [
    {
      kind: "univer-document-without-theme",
      detail: source.includes(CHROME_ONLY_HOOK)
        ? `boots a Univer document and syncs ${CHROME_ONLY_HOOK} (Univer's CHROME) but never ${REQUIRED_HOOK}, so the PAGE keeps Univer's hardcoded light fills`
        : `boots a Univer document and never consumes ${REQUIRED_HOOK}, so the page and the frame keep Univer's hardcoded light fills in every theme`,
    },
  ];
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

function selfTest() {
  // 1. THE DEFECT, exactly as it shipped: the editor as it was before this
  //    guard existed — dark mode synced, page never told anything.
  const before = `
    const { univer, univerAPI } = createUniver({
      theme: defaultTheme,
      darkMode: darkModeRef.current,
      presets: [UniverDocsCorePreset({ container, ribbonType: "simple" })],
    });
    useUniverDarkModeSync(apiRef, bootState === "ready");
  `;
  const planted = findUniverDocThemeGaps(before);

  // 2. The same file once it states the page's colours.
  const after = `${before}\n    useUniverDocSurfaceTheme(univerRef, unitId ?? "", ready);`;
  const fixed = findUniverDocThemeGaps(after);

  // 3. Not a Univer document — a sheet, and a file that merely names Univer.
  const sheet = findUniverDocThemeGaps(`
    createUniver({ presets: [UniverSheetsCorePreset({ container })] });
  `);
  const prose = findUniverDocThemeGaps(
    `// UniverDocsCorePreset is heavy, so the canvas pane lazy-loads it.`,
  );

  const ok =
    planted.length === 1 &&
    planted[0].detail.includes("CHROME") &&
    fixed.length === 0 &&
    sheet.length === 0 &&
    prose.length === 0;

  if (!ok) {
    console.error("check-univer-doc-theme self-test FAILED", {
      planted,
      fixed,
      sheet,
      prose,
    });
    process.exit(3);
  }
  console.log(
    "check-univer-doc-theme self-test: the pre-fix editor (createUniver + UniverDocsCorePreset + useUniverDarkModeSync, no page theme) was caught\n" +
      `  and named as chrome-only; adding ${REQUIRED_HOOK} cleared it; a sheets preset and a prose mention were not flagged.`,
  );
  process.exit(0);
}

if (SELF_TEST) selfTest();

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

if (total === 0) {
  console.log(
    `check-univer-doc-theme: ${documentSurfaces} Univer document surface(s), every one of them stating its page and frame colours through ${REQUIRED_HOOK}.`,
  );
  process.exit(0);
}
console.error(
  `\ncheck-univer-doc-theme: ${total} Univer document surface(s) leave the page to Univer's hardcoded light fills. Consume ${REQUIRED_HOOK} (features/data-tables/hooks/useUniverDocSurfaceTheme.ts) — ${CHROME_ONLY_HOOK} only reaches Univer's chrome.`,
);
process.exit(1);
