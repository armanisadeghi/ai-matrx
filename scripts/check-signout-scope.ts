#!/usr/bin/env npx tsx
/**
 * check:signout-scope — every `auth.signOut(` in this repo names its scope.
 *
 * WHY (2026-09-14): the Supabase default scope is `global`, which deletes
 * EVERY session the account holds on every device and in every tab. Four
 * global logouts of Arman's account in one day — three header clicks from his
 * network and one by a coding agent driving his real Chrome — each killed
 * ~50 open tabs, whose still-valid tokens then met `session_not_found` and
 * painted "Session Expired". Nothing had expired: the live auth configuration
 * is 7-day tokens, no rotation, no inactivity timeout, no time-box.
 *
 * THE RULE: `signOut({ scope: "local" })` — a sign-out ends only the device
 * that asked. `"others"` is allowed when a surface deliberately offers "sign
 * out everywhere else". A bare `signOut()` or `signOut({})` is the defect.
 * Controls never call it directly anyway: they go through
 * `features/shell/auth/useSignOut.ts`, which also asks a super admin twice.
 *
 * Usage: pnpm check:signout-scope            (scan the repo, exit 1 on a hit)
 *        pnpm check:signout-scope --self-test (prove the detector still fails)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface Finding {
  file: string;
  line: number;
  snippet: string;
}

const CALL = /\.signOut\s*\(/g;

/** Pure detector: every `.signOut(` whose argument list carries no `scope`. */
export function findUnscopedSignOuts(source: string, file: string): Finding[] {
  const out: Finding[] = [];
  for (const match of source.matchAll(CALL)) {
    const start = match.index + match[0].length;
    // Walk to the matching close paren (calls here are short and flat).
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const args = source.slice(start, i - 1);
    if (/\bscope\s*:/.test(args)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const snippet = source.split("\n")[line - 1]?.trim() ?? "";
    out.push({ file, line, snippet });
  }
  return out;
}

function trackedSources(): string[] {
  return execSync(
    "git ls-files -- '*.ts' '*.tsx' ':!node_modules' ':!scripts/check-signout-scope.ts'",
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$/.test(f) && !/__tests__\//.test(f));
}

function selfTest(): void {
  const bad = findUnscopedSignOuts(
    'const a = 1;\nawait supabase.auth.signOut();\nawait client.auth.signOut({});\n',
    "fixture.ts",
  );
  const good = findUnscopedSignOuts(
    'await supabase.auth.signOut({ scope: "local" });\nawait x.signOut({\n  scope: "others",\n});\n',
    "fixture.ts",
  );
  if (bad.length !== 2 || good.length !== 0) {
    console.error(
      `check:signout-scope SELF-TEST FAILED — expected 2 bad / 0 good, got ${bad.length} / ${good.length}`,
    );
    process.exit(1);
  }
  console.log("check:signout-scope self-test: detector fails on the unscoped call and passes the scoped ones.");
}

function main(): void {
  if (process.argv.includes("--self-test")) return selfTest();
  const findings: Finding[] = [];
  for (const file of trackedSources()) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!source.includes(".signOut(")) continue;
    findings.push(...findUnscopedSignOuts(source, file));
  }
  if (findings.length === 0) {
    console.log("check:signout-scope: every auth.signOut( names its scope.");
    return;
  }
  console.error(
    `check:signout-scope: ${findings.length} sign-out call(s) without a scope — the Supabase default is GLOBAL and logs the account out of every device:`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.snippet}`);
  console.error(
    '\nFix: signOut({ scope: "local" }) — or route the control through features/shell/auth/useSignOut.ts.',
  );
  process.exit(1);
}

main();
