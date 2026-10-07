#!/usr/bin/env node
/**
 * check:undo-toasts — AN UNDO IS ANNOUNCED BY THE PLATFORM'S ONE PRIMITIVE, NEVER HAND-WRITTEN.
 *
 * THE RULE (Arman, 2026-10-02 — the reversible action): a reversible action acts at once, offers
 * Undo long enough to feel safe, teaches the person the first time and fades after, and answers
 * ⌘Z. One call does all of that: `announceReversible` (`lib/reversible/announceReversible.tsx`,
 * policy in `@ai-matrx/kit/reversible`). A toast that hand-writes `{ action: { label: "Undo" } }`
 * gets none of it — no teaching, no ⌘Z, its own duration, no way to the place the thing went.
 *
 * WHAT IT FAILS ON
 *   An object literal `{ …, label: "Undo", … }` that is the value of a property named `action`
 *   (sonner's toast action and every wrapper that forwards it) or that carries an `onClick` (the
 *   same action built beside the toast, `const undo = { label: "Undo", onClick }`), in app
 *   source — parsed with the
 *   TypeScript compiler, so comments, menu items ("Undo History"), shortcut tables and editor
 *   commands are never counted. A file whose count is above its baseline fails.
 *
 * THE BASELINE (`scripts/undo-toasts-allowlist.json`) is the migration register: today's
 *   hand-written Undo toasts, per file, with a count. It may only shrink: a file whose count
 *   dropped fails too, until `--update` records the smaller number — so a migrated site cannot
 *   quietly grow back.
 *
 * WHAT IT CANNOT SEE: an Undo label built from a variable (`label: undoWord`), or a toast action
 *   assembled in pieces. Static text is all it reads.
 *
 * Usage:
 *   node scripts/check-undo-toasts.mjs              # exit 1 on growth or a stale baseline
 *   node scripts/check-undo-toasts.mjs --update     # re-record the baseline (only ever smaller)
 *   node scripts/check-undo-toasts.mjs --list       # every site, path:line
 *   node scripts/check-undo-toasts.mjs --self-test  # prove each rule can fail
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "undo-toasts-allowlist.json");
const ROOTS = ["app", "features", "components", "lib", "hooks", "utils", "providers", "../aidream/apps/shared/chat/src"];
const SKIP_DIR = new Set(["node_modules", "__tests__", "__mocks__", ".next", "dist"]);
/** The primitive itself is the destination, not the offence. */
const EXEMPT = new Set(["lib/reversible"]);

function walk(root, dir, out) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
    const path = join(dir, name);
    const rel = relative(root, path).split("\\").join("/");
    if ([...EXEMPT].some((e) => rel === e || rel.startsWith(`${e}/`))) continue;
    if (statSync(path).isDirectory()) walk(root, path, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name) && !/\.(test|spec)\.[tj]sx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/** Every hand-written Undo toast action in one file's text: the 1-based lines. */
export function undoActionLines(fileName, text) {
  if (!text.includes("Undo")) return [];
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === "label" &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) &&
      node.initializer.text === "Undo"
    ) {
      const object = node.parent;
      const holder = object?.parent;
      const isActionValue =
        holder &&
        ts.isPropertyAssignment(holder) &&
        (ts.isIdentifier(holder.name) || ts.isStringLiteral(holder.name)) &&
        holder.name.text === "action";
      // A toast action built beside the toast (`const undoToastAction = { label: "Undo", onClick }`,
      // a ternary) has the same shape: a label and a click handler.
      const hasClick =
        object &&
        ts.isObjectLiteralExpression(object) &&
        object.properties.some(
          (p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isMethodDeclaration(p)) &&
            p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === "onClick",
        );
      if (object && ts.isObjectLiteralExpression(object) && (isActionValue || hasClick)) {
        lines.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

export function census(root) {
  const sites = [];
  for (const r of ROOTS) {
    for (const file of walk(root, join(root, r), [])) {
      const rel = relative(root, file).split("\\").join("/");
      for (const line of undoActionLines(rel, readFileSync(file, "utf8"))) sites.push({ file: rel, line });
    }
  }
  return sites;
}

function countsOf(sites) {
  const counts = {};
  for (const s of sites) counts[s.file] = (counts[s.file] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/** The verdict lines for a census against a baseline; empty = pass. */
export function judge(sites, baseline) {
  const counts = countsOf(sites);
  const problems = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    if (n > allowed) {
      const where = sites.filter((s) => s.file === file).map((s) => `${s.file}:${s.line}`).join(", ");
      problems.push(
        `NEW hand-written Undo toast in ${file} (${n}, baseline ${allowed}) at ${where}. ` +
          "Announce it with announceReversible({ verb, noun, subject, undo, foundAt }) from " +
          "@/lib/reversible/announceReversible — it teaches, answers ⌘Z and opens where the thing went.",
      );
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const n = counts[file] ?? 0;
    if (n < allowed) {
      problems.push(
        `STALE baseline: ${file} has ${n} hand-written Undo toast(s), the baseline says ${allowed}. ` +
          "Good — run `node scripts/check-undo-toasts.mjs --update` so it cannot grow back.",
      );
    }
  }
  return problems;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "undo-toasts-"));
  let failures = 0;
  const expect = (name, ok) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failures += 1;
  };
  try {
    mkdirSync(join(dir, "features", "notes"), { recursive: true });
    const plant = (rel, text) => writeFileSync(join(dir, rel), text);
    // Rule 1 — growth: a new hand-written Undo action fails, outside the baseline.
    plant("features/notes/a.tsx", 'toast.success("Archived", { action: { label: "Undo", onClick: undo } });\n');
    expect("a new Undo toast action fails", judge(census(dir), {}).some((p) => p.startsWith("NEW")));
    expect("…and passes once it is in the baseline", judge(census(dir), { "features/notes/a.tsx": 1 }).length === 0);
    // Rule 1b — the same action built beside the toast is counted too.
    plant("features/notes/c.tsx", 'const undoToastAction = { label: "Undo", onClick: undoLast };\n');
    expect("an Undo action built beside the toast fails", judge(census(dir), { "features/notes/a.tsx": 1 }).some((p) => p.includes("features/notes/c.tsx")));
    rmSync(join(dir, "features/notes/c.tsx"));
    // Rule 2 — the baseline only shrinks: a migrated site that leaves a stale count fails.
    plant("features/notes/a.tsx", "announceReversible({ verb: \"archive\", noun: \"note\", undo });\n");
    expect("a stale baseline count fails", judge(census(dir), { "features/notes/a.tsx": 1 }).some((p) => p.startsWith("STALE")));
    // Not counted: comments, menu items, an Undo label that is not a toast action.
    plant(
      "features/notes/b.tsx",
      [
        '// action: { label: "Undo", onClick }',
        'const items = [{ id: "undo", label: "Undo", keys: ["Mod-z"] }];',
        'const history = { action: { label: "Undo History" } };',
        'const tool = { name: "board_undo", label: "Undo", description: "Undoes the last change" };',
      ].join("\n"),
    );
    expect("comments, menu rows and other labels are not counted", census(dir).length === 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (failures) {
    console.error(`check:undo-toasts self-test: ${failures} rule(s) could not fail.`);
    process.exit(1);
  }
  console.log("check:undo-toasts self-test: every rule fails on its plant.");
}

const args = new Set(process.argv.slice(2));
if (args.has("--self-test")) {
  selfTest();
} else {
  const sites = census(ROOT);
  if (args.has("--list")) {
    for (const s of sites) console.log(`${s.file}:${s.line}`);
    console.log(`${sites.length} hand-written Undo toast action(s) in ${Object.keys(countsOf(sites)).length} file(s).`);
  } else if (args.has("--update")) {
    const before = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).files ?? {} : {};
    const now = countsOf(sites);
    const grew = Object.entries(now).filter(([f, n]) => n > (before[f] ?? 0));
    if (existsSync(BASELINE) && grew.length) {
      console.error(`Refusing to grow the baseline: ${grew.map(([f]) => f).join(", ")}. Use announceReversible instead.`);
      process.exit(1);
    }
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ about: "Hand-written Undo toasts awaiting announceReversible (lib/reversible). Only ever shrinks: node scripts/check-undo-toasts.mjs --update.", files: now }, null, 2)}\n`,
    );
    console.log(`Baseline: ${sites.length} site(s) in ${Object.keys(now).length} file(s).`);
  } else {
    const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).files ?? {} : {};
    const problems = judge(sites, baseline);
    if (problems.length) {
      for (const p of problems) console.error(p);
      process.exit(1);
    }
    console.log(`check:undo-toasts: ${sites.length} baselined hand-written Undo toast(s); nothing new.`);
  }
}
