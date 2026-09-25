/**
 * THE FIXTURE LAW detector — see the header of
 * `lib/redux/slices/__tests__/the-fixture-law.organization-context.test.ts`.
 *
 * A test file may name the `AppContextState` fields it is about. What it may
 * not do is spell the WHOLE shape by hand, because that freezes a copy of a
 * type that keeps growing: when `orgBootstrapFailure` became required on
 * 2026-09-18, every such copy broke at once — and the ones hidden behind an
 * `as never` cast did not break, they just went on lying.
 *
 * The detector is structural, not textual: it finds each `orgBootstrapResolved`
 * key, walks out to its enclosing object literal, and counts how many OTHER
 * `AppContextState` keys that same literal carries. Five or more means the
 * literal is standing in for the whole state and belongs behind
 * `makeAppContextState()`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(__dirname, "..");

/** The marker key, and the companions that make a literal "the whole shape". */
const MARKER = "orgBootstrapResolved";
const COMPANION_KEYS = [
  "organization_id",
  "organization_name",
  "personal_organization_id",
  "scope_selections",
  "active_scope_type_ids",
  "project_id",
  "project_name",
  "task_id",
  "task_name",
  "conversation_id",
  "orgBootstrapFailure",
] as const;

/** Five companions alongside the marker = a stand-in for the whole state. */
const WHOLE_SHAPE_THRESHOLD = 5;

/**
 * Repo-relative paths excused from the law. 🚨 THIS LIST ONLY SHRINKS — the
 * guard's second case fails when an entry stops offending, so a stale excuse
 * can never sit here waiting to swallow a new violation. It is empty because
 * the migration left nothing behind; adding to it needs a written reason.
 */
export const APP_CONTEXT_FIXTURE_ALLOWLIST: string[] = [];

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "out",
  "dist",
  ".wt",
  ".matrx",
  ".claude",
]);

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file);
}

/**
 * The repo's own test files: tracked plus untracked-but-not-ignored, exactly
 * the set a commit can carry. A raw directory walk also read the gitignored
 * scratch checkouts parked under work/ (2026-09-24: work/lockfile-repair/ held
 * a copy of this very test, so the guard went red on a file no commit can
 * ship). Jest ignores <rootDir>/work/ for the same reason. If git cannot list
 * the files this throws — a guard that silently reads nothing is no guard.
 */
function repoTestFiles(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);
  const files = listed
    .filter((relative) => isTestFile(relative))
    .filter((relative) => !relative.split("/").some((part) => SKIP_DIRS.has(part)))
    .map((relative) => path.join(repoRoot, relative))
    .filter((absolute) => fs.existsSync(absolute));
  if (files.length === 0) {
    throw new Error("app-context-fixture-law: git listed no test files under " + repoRoot);
  }
  return files;
}

/**
 * This guard's own test carries a hand-spelled literal ON PURPOSE — it is the
 * red sample that proves the detector can fail. It is the one file the sweep
 * never reads.
 */
const DETECTOR_OWN_TEST =
  "lib/redux/slices/__tests__/the-fixture-law.organization-context.test.ts";

/** A literal handed to the builder is the remedy, not the offence. */
const BUILDER_CALL = /makeAppContextState\s*\(\s*$/;

/** The object literal that encloses `index`: its text and its opening brace. */
function enclosingObjectLiteral(
  source: string,
  index: number,
): { text: string; open: number } | null {
  let depth = 0;
  let open = index;
  for (; open >= 0; open--) {
    const char = source[open];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  if (open < 0) return null;

  let nesting = 0;
  for (let close = open; close < source.length; close += 1) {
    const char = source[close];
    if (char === "{") nesting += 1;
    else if (char === "}") {
      nesting -= 1;
      if (nesting === 0) return { text: source.slice(open, close + 1), open };
    }
  }
  return { text: source.slice(open), open };
}

/** True when this source hand-spells a whole `AppContextState`. */
export function isHandSpelledAppContextLiteral(source: string): boolean {
  const marker = new RegExp(`\\b${MARKER}\\s*:`, "g");
  for (let hit = marker.exec(source); hit; hit = marker.exec(source)) {
    const literal = enclosingObjectLiteral(source, hit.index);
    if (!literal) continue;
    // `makeAppContextState({ ... })` IS the remedy — a builder call may name as
    // many fields as the test actually asserts on.
    if (BUILDER_CALL.test(source.slice(0, literal.open))) continue;
    const companions = COMPANION_KEYS.filter((key) =>
      new RegExp(`\\b${key}\\s*:`).test(literal.text),
    ).length;
    if (companions >= WHOLE_SHAPE_THRESHOLD) return true;
  }
  return false;
}

/** Repo-relative paths of every offending test file. */
export function findHandSpelledAppContextFixtures(
  allowlist: readonly string[] = APP_CONTEXT_FIXTURE_ALLOWLIST,
): string[] {
  const offenders: string[] = [];
  for (const absolute of repoTestFiles()) {
    const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
    if (relative === DETECTOR_OWN_TEST) continue;
    if (allowlist.includes(relative)) continue;
    if (isHandSpelledAppContextLiteral(fs.readFileSync(absolute, "utf8"))) {
      offenders.push(relative);
    }
  }
  return offenders.sort();
}
