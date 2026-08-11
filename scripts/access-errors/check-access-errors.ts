#!/usr/bin/env tsx
/**
 * check:access-errors — every surface that still tells a user the wrong thing
 * when a read fails.
 *
 * Under RLS, a zero-row read means one of four different things (denied,
 * deleted, never existed, signed-out). A surface that picks one and asserts it
 * is wrong most of the time — that is the class `features/access-gate/` exists
 * to kill, and this script is the worklist for finishing the job.
 *
 * It finds three offenders:
 *
 *   raw-supabase-message  `throw new Error(error.message)` — PostgREST prose,
 *                         RLS codes, and schema names handed to a human.
 *   claims-deleted        A hand-written sentence asserting deletion or absence
 *                         that the code cannot actually know.
 *   claims-denied         A hand-written permission sentence where the platform
 *                         could say who owns it and offer a request.
 *
 * LOUD, NEVER BLOCKING — per house rule, a guard screams and does not stop a
 * build. `--write` refreshes the committed snapshot; `--strict` exits non-zero
 * for anyone who deliberately wants a gate.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT = join(ROOT, "scripts/access-errors/report.json");

type Kind = "raw-supabase-message" | "claims-deleted" | "claims-denied";

interface Finding {
  file: string;
  line: number;
  kind: Kind;
  snippet: string;
}

/** Directories whose copy a user never reads. */
const SKIP =
  /(^|\/)(node_modules|\.next|\.next-|dist|build|coverage|scripts|migrations|__tests__|__mocks__)(\/|$)/;

const RULES: Array<{ kind: Kind; re: RegExp }> = [
  // `throw new Error(<something>.message)` — the raw PostgREST string.
  {
    kind: "raw-supabase-message",
    re: /throw new Error\(\s*[A-Za-z_$][\w$]*(\?)?\.message/,
  },
  // A sentence asserting the record is gone.
  {
    kind: "claims-deleted",
    re: /["'`][^"'`]*\b(was deleted|no longer accessible|has been deleted|doesn'?t exist|does not exist|not found)\b[^"'`]*["'`]/i,
  },
  // A sentence asserting a permission outcome.
  {
    kind: "claims-denied",
    re: /["'`][^"'`]*\b(don'?t have (access|permission)|do not have (access|permission)|permission denied|access denied|not authorized|unauthorized)\b[^"'`]*["'`]/i,
  },
];

/**
 * Copy that is FINE. The access gate itself obviously names these states, and a
 * few surfaces legitimately describe a permission rather than report one.
 */
const ALLOW = [
  /^features\/access-gate\//,
  /^lib\/records\/recordUnavailable\.ts$/,
  /^lib\/coming-soon\//,
  // API routes answer MACHINES. A JSON 404 with "not found" is the correct
  // response there, not a lie told to a person — flagging ~250 of them would
  // only teach the next agent to ignore this report. This sweep is strictly
  // about copy a HUMAN reads on a page.
  /^app\/api\//,
];

function listFiles(): string[] {
  const out = execSync(
    "git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'features/**/*.ts' 'features/**/*.tsx' " +
      "'components/**/*.ts' 'components/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx' 'hooks/**/*.ts'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP.test(f))
    .filter((f) => !ALLOW.some((re) => re.test(f)));
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of listFiles()) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, i) => {
      // A comment explaining the class is not an instance of it.
      const trimmed = text.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
      for (const rule of RULES) {
        if (rule.re.test(text)) {
          findings.push({
            file,
            line: i + 1,
            kind: rule.kind,
            snippet: trimmed.slice(0, 160),
          });
          break;
        }
      }
    });
  }
  return findings;
}

/** Group by the feature that owns the file, so the sweep can go out in waves. */
function featureOf(file: string): string {
  const parts = file.split("/");
  if (parts[0] === "features") return `features/${parts[1]}`;
  if (parts[0] === "app") return `app/${parts[1] ?? ""}`;
  return parts[0];
}

function main() {
  const write = process.argv.includes("--write");
  const strict = process.argv.includes("--strict");
  const findings = scan();

  const byFeature = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = featureOf(f.file);
    byFeature.set(key, [...(byFeature.get(key) ?? []), f]);
  }
  const ranked = [...byFeature.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const byKind = (k: Kind) => findings.filter((f) => f.kind === k).length;

  console.log("");
  console.log(
    findings.length === 0
      ? "[32m[OK][0m Access errors: every failed read explains itself."
      : `[33m[LOUD][0m Access errors: ${findings.length} surfaces still guess why a read failed. (non-blocking)`,
  );
  console.log(
    `       raw supabase message: ${byKind("raw-supabase-message")}  ` +
      `claims deleted: ${byKind("claims-deleted")}  ` +
      `claims denied: ${byKind("claims-denied")}`,
  );
  console.log("");
  console.log("  Worst features first:");
  for (const [feature, list] of ranked.slice(0, 20)) {
    console.log(`    ${String(list.length).padStart(4)}  ${feature}`);
  }
  console.log("");
  console.log(
    "  Fix: replace the hand-written branch with <AccessGate token id error onRetry/>",
  );
  console.log("       — features/access-gate/FEATURE.md");
  console.log("");

  if (write) {
    writeFileSync(
      REPORT,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString().slice(0, 10),
          total: findings.length,
          byKind: {
            "raw-supabase-message": byKind("raw-supabase-message"),
            "claims-deleted": byKind("claims-deleted"),
            "claims-denied": byKind("claims-denied"),
          },
          byFeature: Object.fromEntries(
            ranked.map(([k, v]) => [k, v.length]),
          ),
          findings,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`  Snapshot written: ${relative(ROOT, REPORT)}`);
    console.log("");
  }

  if (strict && findings.length > 0) process.exit(1);
}

main();
