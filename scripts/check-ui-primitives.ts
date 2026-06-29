#!/usr/bin/env tsx
/**
 * UI primitive check — find hand-rolled form controls that should use the
 * official shadcn components in `components/ui/`.
 *
 * This exists because reinvented primitives (a `<div>` faking a checkbox, a raw
 * `<input type="checkbox">`, a `rounded-full` div faking a Switch) are a
 * recurring, user-visible regression: they skip the design tokens, so they
 * break in light/dark, drop focus rings, and drop keyboard/a11y support. One
 * agent does it once and it ships looking broken. This catches the whole class.
 *
 * What it flags (high signal, low noise):
 *   1. raw-input     <input type="checkbox|radio|range">  → use Checkbox / RadioGroup / Slider
 *      Exception: hidden checkbox inputs that only drive pure-CSS state (:checked,
 *      :has(), peer-checked) — sr-only, aria-hidden, or a dedicated *-toggle hook
 *      class. These are layout switches, not user-visible form controls.
 *   2. fake-checkbox a Check/CheckIcon rendered inside a hand-built bordered,
 *                    rounded box                           → use <Checkbox>
 *   3. fake-switch   a rounded-full track with a translate-x thumb, in a file
 *                    that never imports <Switch>           → use <Switch>
 *
 * The canonical components live in `components/ui/` and are exempt (they ARE
 * the primitive). Radix wrappers and tests are exempt too.
 *
 * Modes (mirror check-doctrine.ts):
 *   pnpm check:ui-primitives              scan the whole repo (default)
 *   pnpm check:ui-primitives --staged     scan staged files only (pre-commit)
 *   pnpm check:ui-primitives --branch foo compare against `foo`
 *   pnpm check:ui-primitives --strict     exit 1 if anything is flagged
 *
 * Exit codes: 0 clean (or findings without --strict) · 1 findings + --strict · 2 error
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Args {
  mode: "repo" | "staged" | "branch";
  branch: string;
  strict: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { mode: "repo", branch: "main", strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--staged") args.mode = "staged";
    else if (a === "--strict") args.strict = true;
    else if (a === "--branch") {
      args.mode = "branch";
      const v = argv[++i];
      if (!v) {
        console.error("--branch requires a value");
        process.exit(2);
      }
      args.branch = v;
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: check-ui-primitives [--staged | --branch <name>] [--strict]",
      );
      process.exit(0);
    }
  }
  return args;
}

function git(cmd: string): string {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`git command failed: ${cmd}\n${message}`);
    process.exit(2);
  }
}

const ROOT = process.cwd();

// ─── File selection ──────────────────────────────────────────────────────────

function shouldScan(file: string): boolean {
  if (!file.endsWith(".tsx")) return false; // JSX only
  if (file.startsWith("node_modules/")) return false;
  if (file.startsWith(".next/")) return false;
  if (file.endsWith(".d.ts")) return false;
  return true;
}

// The official primitives themselves are allowed to hand-build their internals —
// they ARE the abstraction everyone else should consume.
const EXEMPT_RE = [
  /^components\/ui\//,
  /\.test\.tsx$/,
  /__tests__\//,
  /\/__mocks__\//,
];

function isExempt(file: string): boolean {
  return EXEMPT_RE.some((re) => re.test(file));
}

function listRepoFiles(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    // Skip dot-dirs (.git, .next, .claude/worktrees with full repo copies, …),
    // dependency dirs, and build output.
    if (
      entry.startsWith(".") ||
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "build"
    )
      continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) listRepoFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(relative(ROOT, full));
  }
  return acc;
}

function listChangedFiles(args: Args): string[] {
  const cmd =
    args.mode === "staged"
      ? "git diff --cached --name-only --diff-filter=AMRT"
      : `git diff --name-only --diff-filter=AMRT ${args.branch}...HEAD`;
  const raw = git(cmd).trim();
  if (!raw) return [];
  return raw.split("\n").filter(Boolean);
}

function selectFiles(args: Args): string[] {
  const files =
    args.mode === "repo" ? listRepoFiles(ROOT, []) : listChangedFiles(args);
  return files.filter((f) => shouldScan(f) && !isExempt(f));
}

// ─── Scanners ────────────────────────────────────────────────────────────────

type Kind = "raw-input" | "fake-checkbox" | "fake-switch";

interface Finding {
  file: string;
  line: number;
  kind: Kind;
  detail: string;
}

const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split("\n").length;

/** Full `<input …>` tag at `matchIndex` (handles multiline JSX). */
function extractInputTag(text: string, matchIndex: number): string {
  const start = text.lastIndexOf("<input", matchIndex);
  if (start === -1) return "";
  const selfClose = text.indexOf("/>", start);
  const closeTag = text.indexOf(">", start);
  if (selfClose !== -1 && (closeTag === -1 || selfClose < closeTag)) {
    return text.slice(start, selfClose + 2);
  }
  if (closeTag !== -1) return text.slice(start, closeTag + 1);
  return text.slice(start, start + 400);
}

/**
 * Hidden native checkbox driving pure-CSS layout (menus, accordions, sidebars)
 * via :checked / :has() / peer-checked — not a visible form control.
 */
function isCssToggleCheckbox(tag: string): boolean {
  if (/aria-hidden\s*=\s*(?:["']true["']|\{true\})/i.test(tag)) return true;
  if (/className=\{?["'`][^"'`}]*\bsr-only\b/i.test(tag)) return true;
  // Dedicated CSS hook classes (e.g. stb-toggle) — never user-visible primitives.
  if (/className=\{?["'`][^"'`}]*\b[\w-]*-toggle\b/i.test(tag)) return true;
  return false;
}

// 1. Raw native form inputs that bypass the official components entirely.
const RAW_INPUT_RE =
  /<input\b[^>]*\btype\s*=\s*["'](checkbox|radio|range)["']/gi;

// 2. A Check icon rendered inside a hand-built box: an element whose className
//    carries a size + `rounded` + `border`, with a `<Check` / `<CheckIcon`
//    within the next stretch of markup. This is the "fake checkbox" smell.
const BOX_OPEN_RE =
  /className=\{?["'`][^"'`}]*\bw-(?:3|3\.5|4|5)\b[^"'`}]*\brounded\b[^"'`}]*\bborder(?:-\[)?[^"'`}]*["'`]/g;
const CHECK_ICON_RE = /<Check(?:Icon)?\b/;

// 3. A switch thumb. Two high-precision signatures (decorative `absolute …
//    translate-x rounded-full` blobs are deliberately NOT matched — they were
//    the whole false-positive class):
//      a) a STATE-GATED slide — `checked:`/`peer-checked:`/`data-[state=checked]:`
//         (optionally `before:`/`after:`) translate-x. Native-input or peer
//         switches.
//      b) a TERNARY that slides between two positions — `? …translate-x-N… :
//         …translate-x…`. JS-driven toggle thumbs.
const SWITCH_STATE_GATED_RE =
  /(?:checked:|peer-checked:|data-\[state=checked\]:)(?:before:|after:)?translate-x-[0-9.]/;
//    Both branches must be POSITIVE NUMERIC slides (`translate-x-5 :
//    translate-x-0`). This excludes full-screen view slides
//    (`translate-x-0 : -translate-x-full`), which are panels, not switches.
const SWITCH_TERNARY_RE =
  /\?[^?{}]*(?<!-)\btranslate-x-[0-9.]+[^?{}]*:[^?{}]*(?<!-)\btranslate-x-[0-9.]+/;

function importsSwitch(text: string): boolean {
  return /\bimport\b[^\n]*\bSwitch\b[^\n]*from\s+["'][^"']*\/switch["']/.test(
    text,
  );
}

function scanFile(file: string): Finding[] {
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!text) return [];
  const findings: Finding[] = [];

  // 1. raw inputs
  for (const m of text.matchAll(RAW_INPUT_RE)) {
    const index = m.index ?? 0;
    if (m[1] === "checkbox") {
      const tag = extractInputTag(text, index);
      if (tag && isCssToggleCheckbox(tag)) continue;
    }
    findings.push({
      file,
      line: lineAt(text, index),
      kind: "raw-input",
      detail: `raw <input type="${m[1]}"> — use the official ${
        m[1] === "checkbox"
          ? "Checkbox"
          : m[1] === "radio"
            ? "RadioGroup"
            : "Slider"
      }`,
    });
  }

  // 2. fake checkbox: bordered rounded box followed soon after by a Check icon
  for (const m of text.matchAll(BOX_OPEN_RE)) {
    const start = m.index ?? 0;
    const window = text.slice(start, start + 400);
    // Skip explicit rounded-full boxes here (those are dots/avatars/switches).
    if (/\brounded-full\b/.test(m[0])) continue;
    if (CHECK_ICON_RE.test(window)) {
      findings.push({
        file,
        line: lineAt(text, start),
        kind: "fake-checkbox",
        detail:
          "hand-built bordered box with a Check icon — use <Checkbox> from @/components/ui/checkbox",
      });
    }
  }

  // 3. fake switch: a state-gated or ternary slide thumb, in a file that never
  //    imports <Switch>.
  if (!importsSwitch(text)) {
    const m = SWITCH_STATE_GATED_RE.exec(text) ?? SWITCH_TERNARY_RE.exec(text);
    if (m) {
      findings.push({
        file,
        line: lineAt(text, m.index),
        kind: "fake-switch",
        detail:
          "hand-rolled toggle thumb (sliding translate-x) — use <Switch> from @/components/ui/switch",
      });
    }
  }

  return findings;
}

// ─── Report ──────────────────────────────────────────────────────────────────

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  white: "\x1b[97m",
  dim: "\x1b[2m",
};

const KIND_LABEL: Record<Kind, string> = {
  "raw-input": "Raw input",
  "fake-checkbox": "Fake checkbox",
  "fake-switch": "Fake switch",
};

function main(): number {
  const args = parseArgs();
  const files = selectFiles(args);
  if (files.length === 0) return 0;

  const findings: Finding[] = [];
  for (const f of files) findings.push(...scanFile(f));

  if (findings.length === 0) return 0;

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  process.stdout.write(
    `\n${COLOR.yellow}[WARN]${COLOR.reset} UI primitives: ${COLOR.bold}${findings.length}${COLOR.reset} hand-rolled control(s) that should use components/ui.\n` +
      `${COLOR.dim}Reinvented controls skip design tokens → break in light/dark, lose focus rings + a11y.${COLOR.reset}\n\n`,
  );

  for (const f of findings) {
    process.stdout.write(
      `  ${COLOR.yellow}${KIND_LABEL[f.kind].padEnd(14)}${COLOR.reset}` +
        `${COLOR.cyan}${f.file}:${f.line}${COLOR.reset}  ${COLOR.white}${f.detail}${COLOR.reset}\n`,
    );
  }

  if (args.strict) {
    process.stdout.write(
      `\n  ${COLOR.red}--strict: blocking. Replace with the official component in components/ui.${COLOR.reset}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `\n  ${COLOR.white}Use the official components in components/ui. Run with --strict to block.${COLOR.reset}\n`,
  );
  return 0;
}

process.exit(main());
