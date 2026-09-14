#!/usr/bin/env npx tsx
/**
 * check:signout-scope — every `auth.signOut(` in this repo names a LITERAL scope.
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
 * out everywhere else". Anything else is the defect: a bare `signOut()`,
 * `signOut({})`, a scope held in a variable (unreviewable), a scope under a
 * nested key Supabase ignores, or `"global"` itself. Controls never call it
 * directly anyway: they go through `features/shell/auth/useSignOut.ts`,
 * which also asks a super admin twice.
 *
 * Comments and string literals are stripped before matching, so a sentence
 * that mentions `.signOut()` is not a finding (the first version flagged a
 * comment and the comment was reworded to dodge the guard — that is the guard
 * training the code, the wrong way round).
 *
 * Usage: pnpm check:signout-scope            (scan the repo, exit 1 on a hit)
 *        pnpm check:signout-scope --self-test (prove the detector still fails)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface Finding {
  file: string;
  line: number;
  snippet: string;
}

const CALL = /\.signOut\s*\(/g;
const LITERAL_SCOPE = /(^|[{,\s])scope\s*:\s*["'](local|others)["']\s*(,|}|$)/;

/**
 * Replace comments and string contents with spaces of the same length so
 * offsets (and therefore line numbers) survive. Template literals keep their
 * `${…}` holes because a call may sit inside one.
 */
export function blankCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      i++;
      while (i < n && source[i] !== ch && source[i] !== "\n") {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        out += " ";
        i++;
      }
      out += source[i] ?? "";
      i++;
      continue;
    }
    if (ch === "`") {
      out += ch;
      i++;
      while (i < n && source[i] !== "`") {
        if (source[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          let depth = 0;
          while (i < n) {
            const c = source[i];
            out += c;
            i++;
            if (c === "{") depth++;
            else if (c === "}") {
              depth--;
              if (depth === 0) break;
            }
          }
          continue;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += source[i] ?? "";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Pure detector: every `.signOut(` whose argument list is not a literal local/others scope. */
export function findUnscopedSignOuts(source: string, file: string): Finding[] {
  const out: Finding[] = [];
  const blanked = blankCommentsAndStrings(source);
  for (const match of blanked.matchAll(CALL)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < blanked.length && depth > 0) {
      const ch = blanked[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    // Judge the ORIGINAL text of the argument list (the literal scope value
    // was blanked), but only the top-level object: strip nested braces first.
    const args = source.slice(start, i - 1);
    const topLevel = args.replace(/\{[^{}]*\}/g, (m, offset) =>
      offset === args.indexOf("{") ? m : " ".repeat(m.length),
    );
    if (LITERAL_SCOPE.test(topLevel.replace(/^\s*\{/, "{"))) continue;
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

export function selfTest(): boolean {
  const cases: Array<[string, number, string]> = [
    ["await supabase.auth.signOut();", 1, "bare call"],
    ["await client.auth.signOut({});", 1, "empty options"],
    ['await x.signOut({ scope: SOME_VAR });', 1, "scope in a variable"],
    ['await x.signOut({ /* scope: "local" */ });', 1, "commented-out scope"],
    ['await x.signOut({ options: { scope: "local" } });', 1, "nested key Supabase ignores"],
    ['await x.signOut({ scope: "global" });', 1, "explicit global"],
    ['await supabase.auth.signOut({ scope: "local" });', 0, "literal local"],
    ['await x.signOut({\n  scope: "others",\n});', 0, "multi-line literal others"],
    ["// never call .signOut() directly", 0, "line comment"],
    ['const s = "call .signOut() here";', 0, "string literal"],
    ["/* a.signOut() in a block comment */", 0, "block comment"],
  ];
  let ok = true;
  for (const [src, expected, label] of cases) {
    const got = findUnscopedSignOuts(src, "fixture.ts").length;
    if (got !== expected) {
      ok = false;
      console.error(`  self-test: ${label}: expected ${expected} finding(s), got ${got}`);
    }
  }
  if (!ok) {
    console.error("check:signout-scope SELF-TEST FAILED");
    return false;
  }
  console.log(
    `check:signout-scope self-test: ${cases.length} cases — the detector fails on every unscoped shape and passes literal local/others, comments and strings.`,
  );
  return true;
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    if (!selfTest()) process.exit(1);
    return;
  }
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
    console.log("check:signout-scope: every auth.signOut( names a literal local/others scope.");
    return;
  }
  console.error(
    `check:signout-scope: ${findings.length} sign-out call(s) without a literal scope — the Supabase default is GLOBAL and logs the account out of every device:`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.snippet}`);
  console.error(
    '\nFix: signOut({ scope: "local" }) — or route the control through features/shell/auth/useSignOut.ts.',
  );
  process.exit(1);
}

// Entry-point guard: importing the detector from a test must not scan the repo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
