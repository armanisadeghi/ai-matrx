#!/usr/bin/env node
/**
 * check-theme-color-literals.mjs — a surface may not paint itself a colour the
 * theme does not own.
 *
 * THE CLASS (found 2026-09-17, Masterwork 390px/dark-mode cold walk): the sixth
 * cold walk of the Masterwork pipeline ran the whole product at 1440×900 in
 * LIGHT mode only and said so. Dark mode was therefore unmeasured across every
 * capture lane. Nothing had gone wrong there yet — the lanes are written in
 * semantic tokens — but nothing was STOPPING it either: a single `bg-white`,
 * `#fff`, or `bg-slate-100` authored by the next agent produces a panel that
 * stays white while the rest of the screen is dark, and no gate in this repo
 * notices. Dark mode only stays correct if it cannot be broken silently.
 *
 * THE RULE, for the roots this guard is pointed at: colours come from the
 * semantic tokens in `app/globals.css` (`bg-card`, `text-muted-foreground`,
 * `border-border`, `bg-textured`, …). A raw hex / rgb() / hsl() literal, or a
 * light-only Tailwind neutral (`bg-white`, `bg-gray-100`, `text-slate-700`,
 * `border-zinc-200`, …) with no `dark:` counterpart in the same class string,
 * is a finding.
 *
 * WHAT IS NOT A FINDING:
 *  - a saturated accent whose foreground is genuinely theme-independent —
 *    `bg-blue-500 text-white` reads the same in both themes;
 *  - a neutral that carries its own `dark:` counterpart in the same string;
 *  - anything outside a `className` / `class` string or an inline `style`
 *    colour property — prose, comments, ids, placeholders and `#4821` in a
 *    claim number are untouched.
 *
 * Opt out on the line before, with a reason:
 *   {/* theme-color-literal-ok -- why this colour is theme-independent *\/}
 *   // theme-color-literal-ok -- why
 *
 * Usage:
 *   pnpm check:theme-color-literals               # default roots
 *   pnpm check:theme-color-literals <dir> [dir…]  # any root
 *   pnpm check:theme-color-literals --self-test   # plant the class, prove it fails, prove it passes clean
 *
 * Exit: 0 clean · 1 finding(s) · 3 self-test failed
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const SELF_TEST = ARGS.includes("--self-test");
const ROOTS = ARGS.filter((a) => !a.startsWith("--"));
const DEFAULT_ROOTS = ["features/masterwork"];

const OPT_OUT = /theme-color-literal-ok/;

/** Tailwind palettes that are a THEME's job, not a call site's. */
const NEUTRALS = "gray|slate|zinc|neutral|stone";
/** Utilities that paint a surface, a word, a line or a shadow. */
const PAINTS = "bg|text|border|ring|divide|outline|decoration|from|via|to|shadow|fill|stroke|accent|caret|placeholder";

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FUNC_COLOR = /\b(?:rgba?|hsla?|oklch|lab|color)\s*\(/;
const LIGHT_NEUTRAL = new RegExp(`(?<![\\w-])(?:${PAINTS})-(?:${NEUTRALS})-\\d{2,3}(?![\\w-])`);
const WHITE_BLACK = new RegExp(`(?<![\\w-])(?:${PAINTS})-(?:white|black)(?![\\w-])`);
/** A saturated accent in the same string makes `text-white` theme-independent. */
const SATURATED = new RegExp(`(?<![\\w-])(?:bg|from|via|to)-(?!(?:${NEUTRALS})-)[a-z]+-(?:[3-9]00|950)(?![\\w-])`);

/**
 * Every colour literal a class string or inline style hard-codes.
 * Exported so the self-test drives the same function the sweep does.
 * @returns {{line:number, kind:string, text:string}[]}
 */
export function findThemeColorLiterals(source) {
  const lines = source.split("\n");
  const findings = [];

  // className="…" / className={"…"} / className={cn("…", …)} / class="…"
  const classRe = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{)/g;
  // Every quoted string inside a className={…} expression, plus plain attributes.
  const stringsOf = (src) => {
    const out = [];
    let m;
    const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    while ((m = re.exec(src))) out.push({ text: m[2], index: m.index });
    return out;
  };

  const lineOf = (index) => source.slice(0, index).split("\n").length;
  const optedOut = (line) => {
    const prev = lines[line - 2] ?? "";
    return OPT_OUT.test(prev) || OPT_OUT.test(lines[line - 1] ?? "");
  };

  const report = (index, kind, text) => {
    const line = lineOf(index);
    if (optedOut(line)) return;
    findings.push({ line, kind, text: text.trim().slice(0, 120) });
  };

  const judgeClassString = (text, index) => {
    if (HEX.test(text)) return report(index, "hex in class", text);
    if (FUNC_COLOR.test(text)) return report(index, "rgb()/hsl() in class", text);
    const hasDark = /(?<![\w-])dark:/.test(text);
    if (LIGHT_NEUTRAL.test(text) && !hasDark) {
      return report(index, `light-only neutral (${text.match(LIGHT_NEUTRAL)[0]})`, text);
    }
    if (WHITE_BLACK.test(text) && !hasDark && !SATURATED.test(text)) {
      return report(index, `light-only ${text.match(WHITE_BLACK)[0]}`, text);
    }
  };

  let m;
  while ((m = classRe.exec(source))) {
    if (m[1] !== undefined) {
      judgeClassString(m[1], m.index);
      continue;
    }
    if (m[2] !== undefined) {
      judgeClassString(m[2], m.index);
      continue;
    }
    // className={ … } — scan the balanced expression for quoted strings.
    let depth = 1;
    let i = classRe.lastIndex;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    const expr = source.slice(classRe.lastIndex, i);
    for (const s of stringsOf(expr)) judgeClassString(s.text, classRe.lastIndex + s.index);
    classRe.lastIndex = i;
  }

  // Inline style colour properties: style={{ color: "#fff", background: "rgb(…)" }}
  const styleRe = /\bstyle\s*=\s*\{\{([\s\S]{0,600}?)\}\}/g;
  while ((m = styleRe.exec(source))) {
    const body = m[1];
    const propRe = /\b(color|background|backgroundColor|borderColor|fill|stroke|outlineColor|boxShadow|textDecorationColor)\s*:\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;
    let p;
    while ((p = propRe.exec(body))) {
      const value = p[3];
      if (HEX.test(value) || FUNC_COLOR.test(value)) {
        report(m.index + 1 + p.index, `hard-coded ${p[1]}`, `${p[1]}: ${value}`);
      }
    }
  }

  return findings;
}

function trackedFiles(roots) {
  const out = execFileSync(
    "git",
    ["ls-files", "--", ...roots.flatMap((r) => [`${r}/**/*.tsx`, `${r}/**/*.ts`, `${r}/*.tsx`, `${r}/*.ts`])],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean).filter((f) => !f.includes("__tests__") && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

function selfTest() {
  // The exact shapes that break dark mode, and the exact shapes that must not
  // be flagged. Same function the sweep calls — no second implementation.
  const planted = [
    `const a = <div className="rounded-lg bg-white p-4 text-slate-800">panel</div>;`, // 1
    `const b = <div className="bg-card text-foreground">fine</div>;`, // 2
    `const c = <span className="bg-blue-500 text-white">accent, theme-independent</span>;`, // 3
    `const d = <div className="bg-gray-100 dark:bg-gray-800">paired, fine</div>;`, // 4
    `const e = <p style={{ color: "#1a1a1a" }}>hard-coded</p>;`, // 5
    `const f = <div className={cn("border", open && "border-zinc-200")}>expr</div>;`, // 6
    `// theme-color-literal-ok -- the picker's own chrome, documented`,
    `const g = <div className="bg-white">opted out</div>;`, // 8
    `const h = <input placeholder="e.g. Claim #4821 — water damage" />;`, // 9
  ].join("\n");

  const found = findThemeColorLiterals(planted);
  const linesFound = found.map((f) => f.line).sort((x, y) => x - y);
  const expect = [1, 5, 6];
  const ok =
    JSON.stringify(linesFound) === JSON.stringify(expect) &&
    found.some((f) => f.kind.includes("bg-white") || f.kind.includes("neutral"));

  const clean = findThemeColorLiterals(
    [
      `const a = <div className="rounded-lg bg-card p-4 text-muted-foreground">panel</div>;`,
      `const e = <p className="text-foreground">honest</p>;`,
      `const f = <div className={cn("border", open && "border-border")}>expr</div>;`,
    ].join("\n"),
  );

  if (!ok || clean.length !== 0) {
    console.error("check-theme-color-literals self-test FAILED", { linesFound, expect, found, clean });
    process.exit(3);
  }
  console.log(
    "check-theme-color-literals self-test: planted bg-white/text-slate-800, an inline #1a1a1a and a border-zinc-200 inside cn() were all caught;\n" +
      "  bg-card, a saturated `bg-blue-500 text-white`, a `dark:`-paired neutral, an opted-out line and a `#4821` claim number were not; the all-tokens file is clean.",
  );
  process.exit(0);
}

if (SELF_TEST) selfTest();

const roots = ROOTS.length ? ROOTS : DEFAULT_ROOTS;
const files = trackedFiles(roots);
let total = 0;
for (const rel of files) {
  let source;
  try {
    source = readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    continue; // deleted in worktree
  }
  const findings = findThemeColorLiterals(source);
  for (const f of findings) {
    total++;
    console.log(`${rel}:${f.line}  ${f.kind}: ${f.text}`);
  }
}

if (total === 0) {
  console.log(
    `check-theme-color-literals: ${files.length} file(s) under ${roots.join(", ")} carry no hard-coded light-only colour. Dark mode cannot be broken silently here.`,
  );
  process.exit(0);
}
console.error(
  `\ncheck-theme-color-literals: ${total} hard-coded colour(s) under ${roots.join(", ")}. Use the semantic tokens in app/globals.css (bg-card, text-muted-foreground, border-border, …), or opt out on the line before with \`theme-color-literal-ok -- <reason>\`.`,
);
process.exit(1);
