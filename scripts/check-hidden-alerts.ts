/**
 * check:hidden-alerts — AN ERROR ONLY A SCREEN READER CAN SEE IS A SILENT FAILURE.
 *
 * On 2026-09-18 the "+" in the /notes tab bar did nothing, for every person whose "Draft" folder
 * lived in another organization. The failure WAS rendered — as
 * `<p role="alert" className="sr-only">{error}</p>` — so the code read as "handled" while a sighted
 * person saw a dead button. Law 4: a screen is absent or honest.
 *
 * THE RULE. An element that ANNOUNCES a failure (`role="alert"`, or `aria-live="assertive"`) may
 * not be visually hidden (`sr-only`). A polite status region (`aria-live="polite"`, `role="status"`)
 * is NOT covered: "3 results" spoken to a screen reader beside a visible list is good practice.
 * A genuinely duplicated announcement (the same failure is ALSO drawn visibly right beside it) goes
 * in ALLOW below WITH the reason and the visible twin named — never silently.
 *
 *   pnpm check:hidden-alerts             census, exit 1 on any finding
 *   pnpm check:hidden-alerts:self-test   proves the detector fails on the 2026-09-18 line
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOTS = ["app", "features", "components", "lib", "hooks", "providers"];

/** `path:line-text-fragment` → why a hidden alert is acceptable there, naming its visible twin. */
const ALLOW: Record<string, string> = {};

export interface Finding { file: string; line: number; tag: string }

const OPEN_TAG = /<[A-Za-z][\w.]*\b[^<>]*>/g;
const ANNOUNCES = /role\s*=\s*\{?["'`]alert["'`]\}?|aria-live\s*=\s*\{?["'`]assertive["'`]\}?/;
// `sr-only` as its own class token; `not-sr-only` / `focus:not-sr-only` re-show the element.
const HIDDEN = /(^|[\s"'`{(])sr-only(?=[\s"'`})]|$)/;
const RESHOWN = /not-sr-only/;

export function findHiddenAlerts(file: string, source: string): Finding[] {
  const out: Finding[] = [];
  for (const match of source.matchAll(OPEN_TAG)) {
    const tag = match[0];
    if (!ANNOUNCES.test(tag) || !HIDDEN.test(tag) || RESHOWN.test(tag)) continue;
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    out.push({ file, line, tag: tag.replace(/\s+/g, " ").slice(0, 160) });
  }
  return out;
}

function selfTest(): number {
  const cases: Array<[string, string, number]> = [
    ["the 2026-09-18 tab bar", `{e && <p role="alert" className="sr-only">{e}</p>}`, 1],
    ["assertive live region, multi-line", `<div\n  aria-live="assertive"\n  className={cn("sr-only", x)}\n>`, 1],
    ["a visible alert", `<p role="alert" className="text-xs text-destructive">{e}</p>`, 0],
    ["a polite status for screen readers", `<span role="status" aria-live="polite" className="sr-only">3 results</span>`, 0],
    ["an alert re-shown on focus", `<p role="alert" className="sr-only focus:not-sr-only">x</p>`, 0],
    ["sr-only text inside a button, no alert", `<span className="sr-only">Close</span>`, 0],
  ];
  let failed = 0;
  for (const [name, source, expected] of cases) {
    const got = findHiddenAlerts("self-test.tsx", source).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} — expected ${expected}, found ${got}`);
  }
  console.log(failed ? `\ncheck:hidden-alerts self-test FAILED (${failed})` : "\ncheck:hidden-alerts self-test passed");
  return failed ? 1 : 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = execFileSync("git", ["ls-files", "--", ...ROOTS], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f));
  const findings: Finding[] = [];
  for (const file of files) {
    let source: string;
    try { source = readFileSync(file, "utf8"); } catch { continue; }
    if (!source.includes("sr-only")) continue;
    for (const f of findHiddenAlerts(file, source)) {
      const allowed = Object.keys(ALLOW).some((key) => key.startsWith(`${f.file}:`) && f.tag.includes(key.slice(f.file.length + 1)));
      if (!allowed) findings.push(f);
    }
  }
  if (!findings.length) {
    console.log(`check:hidden-alerts — 0 hidden failure announcements across ${files.length} files.`);
    return 0;
  }
  console.error(`check:hidden-alerts — ${findings.length} failure announcement(s) only a screen reader can perceive:\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.tag}`);
  console.error("\nA sighted person sees NOTHING when these fire. Draw the failure visibly (inline text, a toast\nthrough @/lib/toast), or — when it is already drawn right beside it — add the line to ALLOW in\nscripts/check-hidden-alerts.ts naming the visible twin.");
  return 1;
}

process.exit(main());
