#!/usr/bin/env node
/**
 * check-parse.mjs — every tracked `.ts` / `.tsx` file must PARSE.
 *
 * THE CLASS: "an import injected INSIDE an import statement" (2026-09-07).
 * The census-H1 codemod that adopted `@ai-matrx/kit/format` inserted its new
 * `import { … } from "@ai-matrx/kit/format";` line — plus a comment block —
 * at the position of the first matched SYMBOL rather than at the top of the
 * import block. When the matched symbol lived inside a multi-line
 * `import { … } from "…"`, the new import landed between `import {` and the
 * member list:
 *
 *     import type {
 *     // THE package duration formatter (@ai-matrx/kit/format, census H1…)
 *     import { formatDurationSeconds } from "@ai-matrx/kit/format";
 *       FieldChoice,
 *     } from "./types";
 *
 * That is a hard parse error. Seven files landed that way
 * (components/image/cloud/CloudImageList.tsx, features/agents/resources/utils.ts,
 * features/transcripts/service/audioStorageService.ts,
 * utils/file-operations/utils.ts, lib/field-formats/registry.ts,
 * features/marketing/seo/run-console/RunHistoryPanel.tsx,
 * components/chat/UsageStatsModal.tsx — all repaired in fc9a28a26f) and took
 * the SHARED dev server down repeatedly: every route 500, for every agent
 * working out of the checkout, until someone traced it by hand.
 *
 * WHY A SEPARATE GUARD WHEN `pnpm type-check` ALREADY SEES IT. It does — as
 * TS1003 / TS1005 / TS1128. But type-check takes minutes, carries a large
 * tracked backlog of ordinary type errors, and is ADVISORY by standing ruling
 * (D64/D65: type errors scream, they never stop a ship). Nothing ran it
 * between the codemod and the push. This guard reads the same parser, does no
 * type resolution, finishes in seconds, and reports ONLY syntax — a signal
 * with zero backlog and no judgment in it, which is why it can block where
 * type-check cannot.
 *
 * IT EXITS 1 IN BOTH MODES, deliberately, unlike most gates in
 * run-release-gates.sh. A file that does not parse is not an opinion about
 * quality: it cannot build, cannot render, and breaks everyone sharing the
 * tree. There is no backlog to grandfather (0 findings over 14,716 files at
 * introduction) and no lawful exception, so it never earns an advisory
 * carve-out. `--advisory` exists only for a human triaging by hand.
 *
 * Portable by construction: node stdlib + the TypeScript parser already in
 * every Matrx TS repo. Copy it unchanged into matrx-extend / matrx-local /
 * matrx-games.
 *
 * Usage:
 *   pnpm check:parse                 # all tracked .ts/.tsx — exit 1 on any finding
 *   pnpm check:parse --changed       # only files changed vs origin/main + worktree
 *   pnpm check:parse --fix           # repair the injected-import class, then re-check
 *   pnpm check:parse --advisory      # report, exit 0 (human triage only)
 *   pnpm check:parse --self-test     # prove the guard catches the exact 2026-09-07 shape
 *
 * Exit: 0 clean · 1 unparseable file(s) · 3 self-test failed
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const ADVISORY = ARGS.includes("--advisory");
const SELF_TEST = ARGS.includes("--self-test");
const CHANGED = ARGS.includes("--changed");
const FIX = ARGS.includes("--fix");

/* ── the parser ───────────────────────────────────────────────────────────── */

/**
 * Syntax diagnostics for one file's source. Parse-only: no program, no type
 * resolution, no tsconfig — so it cannot report a type error and cannot be
 * fooled by an unresolved import.
 */
export function parseErrors(file, source) {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  // `parseDiagnostics` is where the TS parser records TS1003/TS1005/TS1128 and
  // friends. It is not on the public SourceFile type, hence the cast-by-index.
  const diags = sf["parseDiagnostics"] ?? [];
  return diags.map((d) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
    return {
      code: d.code,
      line: line + 1,
      column: character + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, " "),
    };
  });
}

/* ── the repair (`--fix`) ─────────────────────────────────────────────────── */

/** The line that opens a multi-line import — the one the codemod split. */
const OPEN_IMPORT = /^\s*import\s+(?:type\s+)?\{\s*$/;

/**
 * Move any injected run (comment lines + whole import statements) that sits
 * between `import {` and its member list back ABOVE the import it interrupted.
 * Returns the repaired source, or null when there was nothing to repair.
 * Idempotent. Folded in from the hand-run repair script used on 2026-09-07.
 */
export function repairInjectedImports(source) {
  const lines = source.split("\n");
  let changed = false;
  let i = 0;
  while (i < lines.length) {
    if (!OPEN_IMPORT.test(lines[i])) {
      i += 1;
      continue;
    }
    const run = [];
    let k = i + 1;
    while (k < lines.length) {
      const s = lines[k].trimStart();
      if (s.startsWith("//") || s.startsWith("import ")) {
        run.push(lines[k]);
        k += 1;
        continue;
      }
      break;
    }
    // Only a run that actually contains an IMPORT is an injection. A plain
    // comment directly after `import {` is legal, ordinary code.
    if (run.some((l) => l.trimStart().startsWith("import "))) {
      lines.splice(i, k - i, ...run, lines[i]);
      changed = true;
      i += run.length + 1;
      continue;
    }
    i += 1;
  }
  return changed ? lines.join("\n") : null;
}

/* ── file set ─────────────────────────────────────────────────────────────── */

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\n")
    .filter(Boolean);

function repoFiles() {
  const isTs = (f) => /\.tsx?$/.test(f) && !f.includes("node_modules/");
  if (!CHANGED) return git(["ls-files", "*.ts", "*.tsx"]).filter(isTs);

  const base = (() => {
    try {
      return git(["merge-base", "HEAD", "origin/main"])[0];
    } catch {
      return "HEAD";
    }
  })();
  const set = new Set([
    ...git(["diff", "--name-only", "--diff-filter=ACMR", base]),
    ...git(["diff", "--name-only", "--diff-filter=ACMR"]),
    ...git(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...set].filter(isTs);
}

/* ── self-test ────────────────────────────────────────────────────────────── */

/**
 * The exact 2026-09-07 shape, reproduced from lib/field-formats/registry.ts:
 * the codemod's comment block + its new import, injected at the position of
 * the first matched symbol — which lived inside a multi-line `import type {`.
 */
const BROKEN_FIXTURE = `/**
 * The format registry.
 */
import type {
// THE package duration formatter (\`@ai-matrx/kit/format\`, census H1
// 2026-09-07). THE UNIT LAW: the unit is in the name.
import { formatDurationSeconds } from "@ai-matrx/kit/format";
  FieldChoice,
  FieldFormatDef,
} from "./types";

export const REGISTRY: Record<string, FieldFormatDef> = {};
`;

function selfTest() {
  const results = [];
  const check = (name, ok) => results.push({ name, ok });

  const before = parseErrors("planted.ts", BROKEN_FIXTURE);
  check("the guard REPORTS the injected-import fixture", before.length > 0);
  check(
    "it reports it as the parser's own syntax codes (TS1003/1005/1128 class)",
    before.some((e) => e.code >= 1000 && e.code < 1500),
  );

  const repaired = repairInjectedImports(BROKEN_FIXTURE);
  check("--fix rewrites the fixture", repaired !== null);
  check(
    "the repaired fixture PARSES",
    repaired !== null && parseErrors("planted.ts", repaired).length === 0,
  );
  check(
    "the repair moved the injected import ABOVE the statement it split",
    repaired !== null &&
      repaired.indexOf('from "@ai-matrx/kit/format"') <
        repaired.indexOf("import type {"),
  );
  check(
    "the repair is idempotent",
    repaired !== null && repairInjectedImports(repaired) === null,
  );
  check(
    "it does NOT rewrite an import block whose comment is lawful",
    repairInjectedImports('import {\n  // a plain comment\n  a,\n} from "x";\n') ===
      null,
  );
  check(
    "a clean file reports nothing",
    parseErrors("clean.tsx", 'import { a } from "x";\nexport const B = () => <a />;\n')
      .length === 0,
  );

  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}`);
  }
  return results.every((r) => r.ok);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

function main() {
  if (SELF_TEST) {
    console.log(
      "[parse] self-test — the injected-import class (2026-09-07, 7 files, shared dev server down):",
    );
    const ok = selfTest();
    console.log(
      ok
        ? "[parse] self-test PASSED — the guard still catches the exact shape it was built for."
        : "[parse] self-test FAILED — this guard no longer catches the original defect.",
    );
    process.exit(ok ? 0 : 3);
  }

  const files = repoFiles();
  let findings = files
    .map((file) => {
      let source;
      try {
        source = readFileSync(resolve(ROOT, file), "utf8");
      } catch {
        return null; // deleted between listing and read
      }
      const errors = parseErrors(file, source);
      return errors.length ? { file, errors } : null;
    })
    .filter(Boolean);

  const repaired = [];
  if (FIX) {
    for (const finding of findings) {
      const path = resolve(ROOT, finding.file);
      const fixed = repairInjectedImports(readFileSync(path, "utf8"));
      if (fixed === null) continue;
      if (parseErrors(finding.file, fixed).length) continue; // repair did not clear it
      writeFileSync(path, fixed);
      repaired.push(finding.file);
    }
    for (const file of repaired) console.log(`[parse] repaired ${file}`);
    findings = findings.filter((f) => !repaired.includes(f.file));
  }

  if (findings.length === 0) {
    console.log(
      `[parse] OK — all ${files.length} tracked TypeScript file(s) parse.` +
        (repaired.length ? ` ${repaired.length} repaired by --fix.` : ""),
    );
    process.exit(0);
  }

  console.error(
    `\n[parse] ${findings.length} file(s) DO NOT PARSE. This is not a type ` +
      `error — these files cannot build, cannot render, and take the shared ` +
      `dev server down for everyone in this checkout (every route 500).\n` +
      (FIX
        ? `--fix could not repair them: they are not the injected-import class.\n`
        : `If a codemod injected an import INSIDE an import statement ` +
          `(the 2026-09-07 class), \`pnpm check:parse --fix\` repairs it.\n`),
  );
  for (const { file, errors } of findings) {
    console.error(`  ${file}`);
    for (const e of errors.slice(0, 5)) {
      console.error(`    ${file}:${e.line}:${e.column}  TS${e.code}: ${e.message}`);
    }
    if (errors.length > 5) console.error(`    … ${errors.length - 5} more`);
  }
  console.error("");
  process.exit(ADVISORY ? 0 : 1);
}

main();
