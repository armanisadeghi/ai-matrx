#!/usr/bin/env tsx
/**
 * Doctrine check — see PRINCIPLES.md (root).
 *
 * Scans staged or branch-diff changes and reports the new types, components,
 * hooks, slices, and coercions introduced. Advisory by default — the goal is
 * to surface the question "did you check whether an existing primitive could
 * have been extended instead?" at the moment a new primitive is being added.
 *
 * Modes:
 *   pnpm check:doctrine               compare against the merge-base of `main`
 *   pnpm check:doctrine --staged      scan staged files only (pre-commit)
 *   pnpm check:doctrine --branch foo  compare against `foo` instead of `main`
 *   pnpm check:doctrine --strict      exit 1 if any red flags found
 *
 * Exit codes:
 *   0  no doctrine red flags
 *   0  red flags found (informational) — unless --strict, in which case 1
 *   2  script error (bad args, git failure)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

interface Args {
  mode: "staged" | "branch";
  branch: string;
  strict: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { mode: "branch", branch: "main", strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--staged") args.mode = "staged";
    else if (a === "--strict") args.strict = true;
    else if (a === "--branch") {
      const v = argv[++i];
      if (!v) {
        console.error("--branch requires a value");
        process.exit(2);
      }
      args.branch = v;
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: check-doctrine [--staged | --branch <name>] [--strict]",
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

interface ChangedFile {
  status: "A" | "M" | "R" | "C" | "D" | "T";
  path: string;
}

function listChangedFiles(args: Args): ChangedFile[] {
  const cmd =
    args.mode === "staged"
      ? "git diff --cached --name-status --diff-filter=AMRT"
      : `git diff --name-status --diff-filter=AMRT ${args.branch}...HEAD`;
  const raw = git(cmd).trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const parts = line.split("\t");
    const status = parts[0]?.[0] as ChangedFile["status"];
    const path = parts[parts.length - 1] ?? "";
    return { status, path };
  });
}

function getAddedLines(args: Args, file: string): string[] {
  const cmd =
    args.mode === "staged"
      ? `git diff --cached --unified=0 -- "${file}"`
      : `git diff --unified=0 ${args.branch}...HEAD -- "${file}"`;
  const diff = git(cmd);
  const added: string[] = [];
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added.push(line.slice(1));
    }
  }
  return added;
}

function readWholeFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

// ─── Scanners ────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  line?: number;
  detail: string;
}

interface Report {
  newComponents: Finding[]; // new *.tsx files with default/named exported component
  newHooks: Finding[]; // new use*.ts(x) files
  newTypes: Finding[]; // new exported interface/type declarations in added lines
  coercions: Finding[]; // `as any` and `as unknown as X` introductions
  parallelSlices: Finding[]; // `createSlice(` in unexpected paths (ESLint catches imports, this catches usage)
  frozenUrlCaptures: Finding[]; // capturing Asset.primary_url (freeze a URL that rots) without the file_id
}

const COMPONENT_FILE_RE = /(?:^|\/)[A-Z][A-Za-z0-9]+\.tsx$/;
const HOOK_FILE_RE = /(?:^|\/)use[A-Z][A-Za-z0-9]*\.tsx?$/;
const TYPE_DECL_RE =
  /^\s*export\s+(?:interface\s+([A-Z][A-Za-z0-9]*)|type\s+([A-Z][A-Za-z0-9]*)\s*=)/;
const AS_ANY_RE = /\bas\s+any\b/;
const AS_UNKNOWN_AS_RE = /\bas\s+unknown\s+as\s+/;
const CREATE_SLICE_CALL_RE = /\bcreateSlice\s*\(/;
// A resolved upload URL (Asset.primary_url) being captured. Persisting it
// without ALSO capturing the durable cld_files file_id is the "frozen URL
// rots when the server re-keys" bug class — see
// features/files/BRANDING_FILE_ID_PATTERN.md.
const PRIMARY_URL_CAPTURE_RE = /\.primary_url\b/;
// The file subsystem legitimately defines/maps primary_url; exempt it.
const FILE_INFRA_RE =
  /^(features\/files\/|components\/official\/Image(Asset|Crop))/;

const ALLOWED_SLICE_GLOBS = [
  /^lib\/redux\//,
  /^lib\/sync\//,
  /^features\/[^/]+\/redux\//,
  /^features\/[^/]+\/state\//,
  /^styles\/themes\//,
  /__tests__\//,
  /\.test\.tsx?$/,
];

function isInAllowedSlicePath(file: string): boolean {
  return ALLOWED_SLICE_GLOBS.some((re) => re.test(file));
}

function shouldScan(file: string): boolean {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
  if (file.startsWith("node_modules/")) return false;
  if (file.startsWith(".next/")) return false;
  if (file.endsWith(".d.ts")) return false;
  return true;
}

// Tooling and tests legitimately reference doctrine patterns as text/fixtures
// (this script's own regex; test cases asserting coercion is caught). They
// produce noise without signal, so the coercion / slice scans skip them.
function isToolingOrTest(file: string): boolean {
  if (file.startsWith("scripts/")) return true;
  if (file.includes("__tests__/")) return true;
  if (/\.test\.tsx?$/.test(file)) return true;
  return false;
}

// Strip line comments and the contents of string / template literals so
// pattern matching doesn't trigger on text inside strings or comments.
// Not a full tokenizer — handles single-line cases reliably, which is what
// a per-line diff scan sees.
function stripCommentsAndStrings(line: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (!inDouble && !inBacktick && c === "'" && prev !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inBacktick && c === '"' && prev !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && c === "`" && prev !== "\\") {
      inBacktick = !inBacktick;
      continue;
    }
    if (
      !inSingle &&
      !inDouble &&
      !inBacktick &&
      c === "/" &&
      line[i + 1] === "/"
    ) {
      break;
    }
    if (inSingle || inDouble || inBacktick) continue;
    out += c;
  }
  return out;
}

function scan(args: Args, files: ChangedFile[]): Report {
  const report: Report = {
    newComponents: [],
    newHooks: [],
    newTypes: [],
    coercions: [],
    parallelSlices: [],
    frozenUrlCaptures: [],
  };

  for (const { status, path: file } of files) {
    if (!shouldScan(file)) continue;
    if (status === "D") continue;

    // Whole-file scans for ADDED files
    if (status === "A") {
      if (COMPONENT_FILE_RE.test(file)) {
        report.newComponents.push({ file, detail: "new component file" });
      }
      if (HOOK_FILE_RE.test(file)) {
        report.newHooks.push({ file, detail: "new hook file" });
      }
    }

    // Added-line scans (works for both A and M)
    const addedLines = getAddedLines(args, file);
    const skipPatternScans = isToolingOrTest(file);
    addedLines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*"))
        return;

      const typeMatch = TYPE_DECL_RE.exec(line);
      if (typeMatch) {
        const name = typeMatch[1] ?? typeMatch[2];
        if (name) {
          report.newTypes.push({ file, detail: `export ${name}` });
        }
      }

      if (skipPatternScans) return;
      const code = stripCommentsAndStrings(line);

      if (AS_UNKNOWN_AS_RE.test(code)) {
        report.coercions.push({
          file,
          detail: `\`as unknown as\` cast — ${trimmed.slice(0, 100)}`,
        });
      } else if (AS_ANY_RE.test(code)) {
        report.coercions.push({
          file,
          detail: `\`as any\` cast — ${trimmed.slice(0, 100)}`,
        });
      }

      if (CREATE_SLICE_CALL_RE.test(code) && !isInAllowedSlicePath(file)) {
        report.parallelSlices.push({
          file,
          detail: "createSlice() call outside canonical slice dirs",
        });
      }

      if (PRIMARY_URL_CAPTURE_RE.test(code) && !FILE_INFRA_RE.test(file)) {
        report.frozenUrlCaptures.push({
          file,
          detail: `captures .primary_url — ${trimmed.slice(0, 80)}`,
        });
      }
    });
  }

  return report;
}

// ─── Report ──────────────────────────────────────────────────────────────────

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  white: "\x1b[97m",
};

function hasAnyFindings(r: Report): boolean {
  return (
    r.newComponents.length +
      r.newHooks.length +
      r.newTypes.length +
      r.coercions.length +
      r.parallelSlices.length +
      r.frozenUrlCaptures.length >
    0
  );
}

// [WARN] yellow tag, matching release.sh's log vocabulary.
const WARN_TAG = `${COLOR.yellow}[WARN]${COLOR.reset} `;

function section(label: string, findings: Finding[]) {
  if (findings.length === 0) return;
  const pad = label.padEnd(13);
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const loc = f.line ? `:${f.line}` : "";
    const head =
      i === 0 ? `${COLOR.yellow}${pad}${COLOR.reset}` : " ".repeat(13);
    process.stdout.write(
      `  ${head}${COLOR.cyan}${f.file}${loc}${COLOR.reset}  ${COLOR.white}${f.detail}${COLOR.reset}\n`,
    );
  }
}

function main() {
  const args = parseArgs();
  const files = listChangedFiles(args);

  // Nothing changed, or nothing flagged → stay quiet. Success is silent.
  if (files.length === 0) return 0;
  const report = scan(args, files);
  if (!hasAnyFindings(report)) return 0;

  const total =
    report.newComponents.length +
    report.newHooks.length +
    report.newTypes.length +
    report.coercions.length +
    report.parallelSlices.length +
    report.frozenUrlCaptures.length;

  process.stdout.write(
    `\n${WARN_TAG}Doctrine: ${total} new primitive(s)/flag(s) — confirm none duplicate an existing one.\n\n`,
  );

  section("Components", report.newComponents);
  section("Hooks", report.newHooks);
  section("Types", report.newTypes);
  section("Coercions", report.coercions);
  section("Slices", report.parallelSlices);
  section("Frozen URLs", report.frozenUrlCaptures);

  if (args.strict) {
    process.stdout.write(
      `\n  ${COLOR.red}--strict: blocking. Extend before you create — see PRINCIPLES.md.${COLOR.reset}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `\n  ${COLOR.white}Extend before you create (PRINCIPLES.md, anti-patterns #1-#4). --strict to block.${COLOR.reset}\n`,
  );
  return 0;
}

process.exit(main());
