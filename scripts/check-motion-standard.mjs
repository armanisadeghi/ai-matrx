#!/usr/bin/env node
// scripts/check-motion-standard.mjs
//
// THE MOTION STANDARD (Arman, 2026-10-02 — law: common-docs/policies/motion-standard.md).
//
// Every panel, sidebar, dock, drawer, sheet and the canvas column slides its
// size/position on ONE pair, defined once in app/globals.css:
//   --matrx-motion-duration-panel (600ms; 0ms under reduced motion)
//   --matrx-motion-ease-panel     (cubic-bezier(0.4, 0, 0.2, 1) — never the spring)
// Tailwind form: PANEL_MOTION_CLASS from @ai-matrx/design-system.
//
// This flags a panel slide that states its own pace instead:
//   TSX — a geometry transition (transition-[width] / -transform / -all …) with a
//         literal `duration-*` or `ease-*` class, next to a panel signal
//         (translate-x-full, a conditional w-0, sidebarOpen / panelOpen / railOpen …);
//   CSS — a rule whose selector names a panel (sidebar, panel, dock, drawer,
//         sheet, canvas, rail, inspector, the shell root/layouts) transitioning or
//         animating a geometry property (width, left, right, grid-template-columns,
//         transform, margin-left/right, flex-basis, a slide keyframe) on anything
//         but the panel tokens or their aliases;
//   VARIABLE — a custom property that names a panel's pace given its own value
//         (`--sidebar-duration: 200ms`, `"--drawer-easing": "linear"` in a style
//         object) instead of the panel tokens — the Sidebar shipped exactly this;
//   NAMED SETTING — a pace passed through a named prop / option / constant
//         (`animationDuration={300}`, `slideDurationMs: 250`,
//         `const SIDEBAR_SLIDE = "transition-[width] duration-300"`) on a panel.
//
// Heuristic by design: it catches the shapes that shipped, not every possible
// one. A true exception goes in ALLOWED with its reason. Advisory (scream, never
// block): run by scripts/run-release-gates.sh; exits 1 when it finds something.
//
// Usage: node scripts/check-motion-standard.mjs [--self-test] [files…]

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SOURCE_ROOTS } from "./lib/source-roots.cjs";

const ROOT = new URL("..", import.meta.url).pathname;

/** Files not governed, each with its reason. */
const ALLOWED = new Map([
  ["features/tasks/components/mobile/MobileTasksView.tsx", "full-screen view push on phones (list → details): navigation, not a panel"],
  ["features/notes/components/mobile/MobileNotesView.tsx", "full-screen view push on phones (list → editor): navigation, not a panel"],
]);

const TOKEN_DURATION = /var\(--(?:matrx-motion-duration-panel|mxc-motion-duration|shell-duration-panel)\)/;
const TOKEN_EASE = /var\(--(?:matrx-motion-ease-panel|mxc-motion-ease|shell-ease-smooth)\)/;

// ── TSX ──────────────────────────────────────────────────────────────────────
const TW_GEOM = /(?:^|[\s"'`])transition-(?:all|transform|\[(?:[\w-]+,)*(?:width|left|right|transform|grid-template-columns|margin|margin-left|margin-right|max-width|flex-basis|inset)[\],])/;
const TW_LITERAL_TIMING = /(?:^|[\s"'`])((?:[\w-]+:)*(?:duration-(?:\d+|\[[^\]\s]+\])|ease-(?:\[[^\]\s]+\]|in-out|in|out|linear)))(?=[\s"'`]|$)/;
/** A conditional on a panel's own state: sidebarOpen, isPanelCollapsed, railOpen … */
const PANEL_STATE = /\b\w*(?:[sS]idebar|[pP]anel|[rR]ail|[dD]rawer|[dD]ock|[iI]nspector|[sS]heet)\w*(?:Open|Collapsed|Expanded|Visible)\b/;
/** A width that collapses to nothing on a condition: `? "w-64" : "w-0"`. */
const COLLAPSES_TO_ZERO = /:\s*["'`][^"'`]*\bw-0\b/;
/** An off-screen slide on an element that names itself a panel. */
const OFFSCREEN = /-?translate-[xy]-full\b/;
const PANEL_WORD = /<aside\b|\b(?:sidebar|panel|rail|drawer|dock|inspector|sheet)\b/i;
const isPanelWindow = (win) => PANEL_STATE.test(win) || COLLAPSES_TO_ZERO.test(win) || (OFFSCREEN.test(win) && PANEL_WORD.test(win));
const USES_TOKEN = /PANEL_MOTION_CLASS|--matrx-motion-|SIDE_PANEL_SLIDE_CLASS/;
/** A constant whose NAME says it holds a panel's motion: `const SIDEBAR_SLIDE = "…"`. */
const PANEL_CONST = /\b(?:const|let)\s+\w*(?:SIDEBAR|PANEL|RAIL|DRAWER|DOCK|INSPECTOR|SHEET|[sS]idebar|[pP]anel|[rR]ail|[dD]rawer|[dD]ock|[iI]nspector|[sS]heet)\w*\s*=/;

// ── VARIABLE / NAMED SETTING (shared by TSX and CSS) ────────────────────────
/** A custom property naming a panel's pace: --sidebar-duration, --drawer-ease, --panel-transition … */
const PACE_VAR_DECL = /(["'`]?)(--[\w-]*(?:sidebar|panel|rail|drawer|dock|inspector|sheet)[\w-]*-(?:duration|easing|ease|speed|timing|transition))\1\s*:\s*([^;,}\n]+)/i;
/** A named pace setting: animationDuration={300}, slideDurationMs: 250, collapseEasing: "ease-out" … */
const NAMED_PACE = /\b((?:animation|transition|slide|collapse|expand|open|close)(?:Duration(?:Ms)?|Ms|Easing|Ease|TimingFunction|Speed))\s*(?::|=)\s*\{?\s*(["'`][^"'`]*["'`]|\d[\d.]*)/;
const TOKEN_VALUE = /var\(--(?:matrx-motion-(?:duration|ease)-panel|mxc-motion-(?:duration|ease)|shell-duration-panel|shell-ease-smooth)\)|PANEL_MOTION_(?:DURATION|EASE)_VAR/;

function paceVariableFindings(line, file, lineNo) {
  const v = line.match(PACE_VAR_DECL);
  if (!v || TOKEN_VALUE.test(v[3])) return [];
  return [`${file}:${lineNo}  panel pace variable ${v[2]} given its own value "${v[3].trim()}" — define it from var(--matrx-motion-duration-panel) / var(--matrx-motion-ease-panel)`];
}

function findingsForSource(src, file) {
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    out.push(...paceVariableFindings(lines[i], file, i + 1));
    const win = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
    const named = lines[i].match(NAMED_PACE);
    if (named && !TOKEN_VALUE.test(named[2]) && (isPanelWindow(win) || PANEL_WORD.test(win) || PANEL_CONST.test(win))) {
      out.push(`${file}:${i + 1}  panel pace set through "${named[1]}" = ${named[2]} — a panel slides on THE panel motion (PANEL_MOTION_CLASS / PANEL_MOTION_DURATION_VAR), never its own setting`);
      continue;
    }
    const m = lines[i].match(TW_LITERAL_TIMING);
    if (!m || USES_TOKEN.test(lines[i])) continue;
    const near = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
    if (!TW_GEOM.test(near)) continue;
    if (!isPanelWindow(win) && !PANEL_CONST.test(lines.slice(Math.max(0, i - 1), i + 1).join("\n"))) continue;
    out.push(`${file}:${i + 1}  panel slide with its own pace "${m[1]}" — use PANEL_MOTION_CLASS (@ai-matrx/design-system)`);
  }
  return out;
}

// ── CSS ──────────────────────────────────────────────────────────────────────
const PANEL_SELECTOR = /(?:panel|sidebar|dock|drawer|sheet|canvas|rail|inspector|shell-root|shell-main|data-public-layout|data-link-layout)/i;
/** A subject that is a control or a piece of content INSIDE a panel, not the panel. */
const NOT_A_PANEL = /(?:menu|dropdown|popover|overflow|item|label|caret|icon|btn|button|logo|toggle|nav|pill|chevron|search|badge|tab)/i;
/** The compound a selector styles: the text after its last combinator. */
const subjectOf = (complex) => complex.trim().split(/\s*[\s>~+]\s*/).pop() ?? "";
const isPanelSubject = (complex) => {
  const subject = subjectOf(complex);
  return PANEL_SELECTOR.test(subject) && !NOT_A_PANEL.test(subject);
};
const GEOM_SEGMENT = /^\s*(?:width|left|right|grid-template-columns|transform|translate|margin-left|margin-right|margin-inline|flex-basis|inset)\b/;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function splitTop(value) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const c of value) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function findingsForCss(css, file) {
  const out = [];
  const text = stripComments(css);
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = RULE.exec(text))) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@") || /^(?:from|to|\d+%)/.test(selector)) continue;
    const line = text.slice(0, m.index + m[1].length).split("\n").length;
    for (const decl of m[2].split(";")) out.push(...paceVariableFindings(decl, file, line));
    if (!selector.split(",").some(isPanelSubject)) continue;
    for (const decl of m[2].split(";")) {
      const d = decl.match(/^\s*(transition|animation)\s*:\s*([\s\S]+)$/);
      if (!d) continue;
      for (const seg of splitTop(d[2])) {
        const s = seg.replace(/\s+/g, " ").trim();
        const geom = d[1] === "transition" ? GEOM_SEGMENT.test(s) : /slide/i.test(s.split(" ")[0]);
        if (!geom) continue;
        if (TOKEN_DURATION.test(s) && TOKEN_EASE.test(s)) continue;
        out.push(`${file}:${line}  "${selector}" slides "${s}" — use var(--matrx-motion-duration-panel) var(--matrx-motion-ease-panel)`);
      }
    }
  }
  return out;
}

// ── walk ─────────────────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    // (dev) demos are internal experiments, not the product the law governs.
    if (name === "node_modules" || name === "__tests__" || name === "(dev)" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts|css)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !/\.dev\.tsx$/.test(name)) acc.push(p);
  }
  return acc;
}

function scan(files) {
  const findings = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (ALLOWED.has(rel)) continue;
    const text = readFileSync(f, "utf8");
    if (f.endsWith(".css")) findings.push(...findingsForCss(text, rel));
    else findings.push(...findingsForSource(text, rel));
  }
  return findings;
}

function selfTest() {
  const red = [
    ['<aside className={cn("absolute right-0 w-72 transition-transform duration-200 ease-out", railOpen ? "translate-x-0" : "translate-x-full")} />', "x.tsx"],
    ['<div className={cn("shrink-0 transition-all duration-300 ease-in-out",\n  sidebarOpen ? "w-48" : "w-0",\n)} />', "x.tsx"],
    ['const C = "transition-[width] duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"; // panelOpen ? "w-80" : "w-0"', "x.tsx"],
    [".shell-sidebar { transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms ease; }", "x.css"],
    [".shell-panel { transition: transform var(--shell-duration-slow) var(--shell-ease-spring); }", "x.css"],
    [".hdr-sheet-panel { animation: hdr-sheet-slide-up 450ms var(--shell-ease-spring); }", "x.css"],
    // A pace through a VARIABLE (the design-system Sidebar shipped this until 0.56.0).
    ['style={{ "--sidebar-duration": "200ms", "--sidebar-easing": "linear" } as React.CSSProperties}', "x.tsx"],
    [":root { --drawer-transition-duration: 300ms; }", "x.css"],
    // A pace through a NAMED SETTING.
    ['<FloatingSheet open={railOpen} animationDuration={300} />', "x.tsx"],
    ['const drawer = { slideDurationMs: 250, side: "right" };', "x.tsx"],
    ['const SIDEBAR_SLIDE =\n  "transition-[width] duration-300 ease-out";', "x.tsx"],
  ];
  const green = [
    ['<aside className={cn("absolute right-0 w-72 transition-transform", PANEL_MOTION_CLASS, railOpen ? "translate-x-0" : "translate-x-full")} />', "x.tsx"],
    ['<ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />', "x.tsx"],
    ['<div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: pct }} />', "x.tsx"],
    [".shell-sidebar { transition: width var(--matrx-motion-duration-panel) var(--matrx-motion-ease-panel), background 200ms ease; }", "x.css"],
    [".shell-chat-dock { transition: left var(--shell-duration-panel) var(--shell-ease-smooth); }", "x.css"],
    [".shell-dock-item { transition: color 200ms ease; }", "x.css"],
    [".menu-chevron { transition: transform 200ms var(--shell-ease-spring); }", "x.css"],
    ['style={{ "--sidebar-duration": "var(--matrx-motion-duration-panel)", "--sidebar-easing": "var(--matrx-motion-ease-panel)" } as React.CSSProperties}', "x.tsx"],
    [":root { --shell-duration-panel: var(--matrx-motion-duration-panel); --sidebar-width: 16rem; }", "x.css"],
    ['<Tooltip delayDuration={0} />', "x.tsx"],
    ['<Toast animationDuration={300} />', "x.tsx"],
    ['<FloatingSheet open={railOpen} animationDuration={PANEL_MOTION_DURATION_VAR} />', "x.tsx"],
  ];
  let failed = 0;
  for (const [src, f] of red) {
    const n = f.endsWith(".css") ? findingsForCss(src, f).length : findingsForSource(src, f).length;
    if (n === 0) {
      failed++;
      console.error(`SELF-TEST FAIL (missed): ${src}`);
    }
  }
  for (const [src, f] of green) {
    const got = f.endsWith(".css") ? findingsForCss(src, f) : findingsForSource(src, f);
    if (got.length) {
      failed++;
      console.error(`SELF-TEST FAIL (false alarm): ${src}\n  ${got.join("\n  ")}`);
    }
  }
  if (failed) {
    console.error(`check-motion-standard self-test: ${failed} case(s) wrong`);
    process.exit(1);
  }
  console.log(`check-motion-standard self-test: ${red.length} red caught, ${green.length} green clean`);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  selfTest();
} else {
  const files = args.length ? args.map((a) => join(process.cwd(), a)) : SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r))).concat(walk(join(ROOT, "styles")));
  const unique = [...new Set(files)];
  const findings = scan(unique);
  if (findings.length) {
    console.error(`Motion standard: ${findings.length} panel slide(s) off THE panel motion (common-docs/policies/motion-standard.md):`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`Motion standard: ${unique.length} files, every panel slide on THE panel motion.`);
}
