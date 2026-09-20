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
 * is NOT covered (below): "3 results" spoken to a screen reader beside a visible list is good practice.
 * A genuinely duplicated announcement (the same failure is ALSO drawn visibly right beside it) goes
 * in ALLOW below WITH the reason and the visible twin named — never silently.
 *
 * ALSO CAUGHT: a visually hidden PARENT (`sr-only` wrapper, `<VisuallyHidden>`) around the
 * announcement, the bare `hidden` attribute, and `title=` / `aria-label=` expressions that carry an
 * error (baselined, only shrinks). NOT CATCHABLE STATICALLY, and said so rather than implied: a
 * className held in a variable. The behavioural guard for that is the hook test
 * (features/notes/hooks/useDraftInitializationControl.test.tsx): the BOUNDARY announces, so a surface
 * that hides its copy cannot make the failure silent.
 *
 *   pnpm check:hidden-alerts             census, exit 1 on any finding
 *   pnpm check:hidden-alerts:self-test   proves the detector fails on the 2026-09-18 line
 */
import { exitAfterDrain } from "./lib/exit-after-drain";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ROOTS = ["app", "features", "components", "lib", "hooks", "providers"];

/** `path:line-text-fragment` → why a hidden alert is acceptable there, naming its visible twin. */
const ALLOW: Record<string, string> = {};

export interface Finding { file: string; line: number; tag: string }

const OPEN_TAG = /<[A-Za-z][\w.]*\b[^<>]*>/g;
const ANNOUNCES = /role\s*=\s*\{?["'`]alert["'`]\}?|aria-live\s*=\s*\{?["'`]assertive["'`]\}?/;
// `sr-only` as its own class token; `not-sr-only` / `focus:not-sr-only` re-show the element.
const HIDDEN = /(^|[\s"'`{(])sr-only(?=[\s"'`})]|$)/;
const RESHOWN = /not-sr-only/;

/** An opening tag that hides its whole subtree from sight. */
const HIDING_PARENT = /<(?:VisuallyHidden\b[^<>]*|[A-Za-z][\w.]*\b[^<>]*\bclassName\s*=\s*[^<>]*?(?:^|[\s"'`{(])sr-only(?=[\s"'`})])[^<>]*)>/g;
/** `hidden` as a bare boolean attribute on the announcing element itself. */
const HIDDEN_ATTR = /\shidden(?=[\s/>])(?!\s*=\s*\{?\s*false)/;
/** How far into a hiding parent we look for an announcing child. JSX this small is one component. */
const SUBTREE_WINDOW = 600;

/**
 * `title={error}` / `aria-label={error}` — the OTHER half of the 2026-09-18 defect: a failure
 * carried only by a tooltip or an accessible name. Judged by the expression's identifiers, so a
 * static `title="Delete"` is never a finding. Pre-existing sites live in the BASELINE, which only
 * shrinks; a new one fails.
 */
const ERROR_IN_LABEL = /\b(title|aria-label)\s*=\s*\{([^{}]*\b\w*(?:[eE]rror|[fF]ailure)\w*\b[^{}]*)\}/g;

export function findHiddenAlerts(file: string, source: string): Finding[] {
  const out: Finding[] = [];
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;
  const show = (text: string) => text.replace(/\s+/g, " ").slice(0, 160);
  for (const match of source.matchAll(OPEN_TAG)) {
    const tag = match[0];
    if (!ANNOUNCES.test(tag)) continue;
    const hiddenHere = (HIDDEN.test(tag) && !RESHOWN.test(tag)) || HIDDEN_ATTR.test(tag);
    if (hiddenHere) out.push({ file, line: lineOf(match.index ?? 0), tag: show(tag) });
  }
  // The same defect one nesting level up: a visually hidden PARENT around the announcement.
  for (const parent of source.matchAll(HIDING_PARENT)) {
    if (RESHOWN.test(parent[0]) || ANNOUNCES.test(parent[0])) continue;
    const start = (parent.index ?? 0) + parent[0].length;
    const inside = source.slice(start, start + SUBTREE_WINDOW);
    const closeAt = inside.search(/<\/(?:VisuallyHidden|div|span|p|section)>/);
    const subtree = closeAt === -1 ? inside : inside.slice(0, closeAt);
    const child = subtree.match(/<[A-Za-z][\w.]*\b[^<>]*>/g)?.find((t) => ANNOUNCES.test(t));
    if (child) out.push({ file, line: lineOf(parent.index ?? 0), tag: show(`${parent[0]} … ${child}`) });
  }
  return out;
}

export function findErrorOnlyLabels(file: string, source: string): Finding[] {
  const out: Finding[] = [];
  for (const match of source.matchAll(ERROR_IN_LABEL)) {
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    out.push({ file, line, tag: match[0].replace(/\s+/g, " ").slice(0, 160) });
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
    ["a hidden PARENT around the alert", `<div className="sr-only"><p role="alert">{e}</p></div>`, 1],
    ["VisuallyHidden around the alert", `<VisuallyHidden><p role="alert">{e}</p></VisuallyHidden>`, 1],
    ["the hidden attribute on the alert", `<p role="alert" hidden>{e}</p>`, 1],
    ["hidden={false} is visible", `<p role="alert" hidden={false}>{e}</p>`, 0],
    ["a hidden parent whose alert is a SIBLING after it closes", `<span className="sr-only">x</span><p role="alert">{e}</p>`, 0],
  ];
  const labelCases: Array<[string, string, number]> = [
    ["the 2026-09-18 tab-bar tooltip", `<button title={draftControl.error ?? "New note"} />`, 1],
    ["an accessible name carrying the failure", `<button aria-label={saveError || "Save"} />`, 1],
    ["a static title", `<button title="Delete" />`, 0],
    ["a title from a label", `<button title={item.label} />`, 0],
  ];
  let failed = 0;
  for (const [name, source, expected] of cases) {
    const got = findHiddenAlerts("self-test.tsx", source).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} — expected ${expected}, found ${got}`);
  }
  for (const [name, source, expected] of labelCases) {
    const got = findErrorOnlyLabels("self-test.tsx", source).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} [label] ${name} — expected ${expected}, found ${got}`);
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
  const BASELINE_PATH = "scripts/hidden-alerts-label-baseline.json";
  const labels: Finding[] = [];
  for (const file of files) {
    let source: string;
    try { source = readFileSync(file, "utf8"); } catch { continue; }
    if (!/title|aria-label/.test(source)) continue;
    labels.push(...findErrorOnlyLabels(file, source));
  }
  const key = (f: Finding) => `${f.file} :: ${f.tag}`;
  if (process.argv.includes("--write-baseline")) {
    writeFileSync(BASELINE_PATH, JSON.stringify({
      note: "title=/aria-label= expressions that carry an error. Each is a failure a sighted person may only meet on hover. ONLY SHRINKS: fix a site (draw the failure visibly) and delete its line; never add one.",
      sites: [...new Set(labels.map(key))].sort(),
    }, null, 2) + "\n");
    console.log(`check:hidden-alerts — baseline written with ${labels.length} site(s).`);
    return 0;
  }
  let baseline: string[] = [];
  try { baseline = (JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { sites: string[] }).sites; } catch { /* no baseline = every site is new */ }
  const newLabels = labels.filter((f) => !baseline.includes(key(f)));
  const stale = baseline.filter((b) => !labels.some((f) => key(f) === b));
  if (stale.length) console.log(`check:hidden-alerts — ${stale.length} baseline site(s) are fixed; delete them from ${BASELINE_PATH}:\n  ${stale.join("\n  ")}`);
  if (newLabels.length) {
    console.error(`check:hidden-alerts — ${newLabels.length} NEW tooltip/accessible-name that carries a failure:\n`);
    for (const f of newLabels) console.error(`  ${f.file}:${f.line}\n    ${f.tag}`);
    console.error("\nA tooltip is not an announcement. Draw the failure visibly; keep the label constant.\n");
  }
  if (!findings.length && newLabels.length) return 1;
  if (!findings.length) {
    console.log(`check:hidden-alerts — 0 hidden failure announcements, 0 new error-only labels (${labels.length} baselined) across ${files.length} files.`);
    return 0;
  }
  console.error(`check:hidden-alerts — ${findings.length} failure announcement(s) only a screen reader can perceive:\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.tag}`);
  console.error("\nA sighted person sees NOTHING when these fire. Draw the failure visibly (inline text, a toast\nthrough @/lib/toast), or — when it is already drawn right beside it — add the line to ALLOW in\nscripts/check-hidden-alerts.ts naming the visible twin.");
  return 1;
}

exitAfterDrain(main());
