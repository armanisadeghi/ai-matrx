#!/usr/bin/env node
// scripts/check-motion-standard.mjs
//
// THE MOTION STANDARD (Arman, 2026-10-02 — law: common-docs/policies/motion-standard.md).
//
// Every panel, sidebar, dock, drawer, sheet and the canvas column slides its
// size/position on ONE pair, defined once in app/globals.css:
//   --matrx-motion-duration-panel (600ms; 0ms under reduced motion)
//   --matrx-motion-ease-panel     (cubic-bezier(0.4, 0, 0.2, 1) — never the spring)
// Tailwind form: PANEL_MOTION_CLASS from lib/motion/panel-motion.ts.
//
// This flags a panel slide that states its own pace instead:
//   TSX — a geometry transition (transition-[width] / -transform / -all …) with a
//         literal `duration-*` or `ease-*` class, next to a panel signal
//         (translate-x-full, a conditional w-0, sidebarOpen / panelOpen / railOpen …);
//   CSS — a rule whose selector names a panel (sidebar, panel, dock, drawer,
//         sheet, canvas, rail, inspector, the shell root/layouts) transitioning or
//         animating a geometry property (width, left, right, grid-template-columns,
//         transform, margin-left/right, flex-basis, a slide keyframe) on anything
//         but the panel tokens or their aliases.
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
  ["features/agent-apps/sample-code/templates/chat-with-history-template.ts", "source text of a starter app we hand to a person, not our own UI"],
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

function findingsForSource(src, file) {
  const out = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TW_LITERAL_TIMING);
    if (!m || USES_TOKEN.test(lines[i])) continue;
    const near = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
    if (!TW_GEOM.test(near)) continue;
    const win = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
    if (!isPanelWindow(win)) continue;
    out.push(`${file}:${i + 1}  panel slide with its own pace "${m[1]}" — use PANEL_MOTION_CLASS (lib/motion/panel-motion.ts)`);
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
    if (!selector.split(",").some(isPanelSubject)) continue;
    const line = text.slice(0, m.index + m[1].length).split("\n").length;
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
  ];
  const green = [
    ['<aside className={cn("absolute right-0 w-72 transition-transform", PANEL_MOTION_CLASS, railOpen ? "translate-x-0" : "translate-x-full")} />', "x.tsx"],
    ['<ChevronDown className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} />', "x.tsx"],
    ['<div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: pct }} />', "x.tsx"],
    [".shell-sidebar { transition: width var(--matrx-motion-duration-panel) var(--matrx-motion-ease-panel), background 200ms ease; }", "x.css"],
    [".shell-chat-dock { transition: left var(--shell-duration-panel) var(--shell-ease-smooth); }", "x.css"],
    [".shell-dock-item { transition: color 200ms ease; }", "x.css"],
    [".menu-chevron { transition: transform 200ms var(--shell-ease-spring); }", "x.css"],
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
