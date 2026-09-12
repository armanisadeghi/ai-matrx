#!/usr/bin/env tsx
/**
 * Phone-layout guard — catches the desktop-only-geometry defect class that
 * made /administration/users/feedback unusable on a phone (2026-09-12).
 *
 * THE CLASS: a surface authored for a wide screen whose geometry never
 * reflows below the mobile breakpoint. Nothing throws; the page is simply a
 * 1,200px sideways scroller, or a sheet that overshoots the viewport, or a
 * three-column grid squeezed to 120px per cell. Three mechanical signatures:
 *
 *   T  a hand-rolled data table (≥3 `<TableHead>` columns, at least one
 *      pinned `w-[Npx]`) with NO phone reflow. A reflow is one of: the design-system
 *      `<Table wrapperClassName="phone-stack">` (THE PHONE-STACK TABLE,
 *      app/globals.css), MatrxDataTable's `mobileCards`, a `useIsMobile()`
 *      branch, or an explicit `sm:hidden` / `md:hidden` / `lg:hidden` twin.
 *   V  a static viewport unit: `h-screen` / `min-h-screen` / `max-h-screen`
 *      or an arbitrary `*h-[Nvh]`. iOS Safari's `vh` is the LARGEST viewport
 *      (browser chrome hidden), so `max-h-[85vh]` puts the bottom of a sheet
 *      — usually its submit button — under the address bar. `dvh` tracks the
 *      visible viewport. (Rule 1 of the `ios-mobile-first` skill.)
 *   G  inside a file that renders a `DialogContent` / `SheetContent` /
 *      `DrawerContent`, a className whose base `grid-cols-N` is 3 or more
 *      with no responsive `grid-cols-` variant beside it. Three 390/3px
 *      columns hold about eight characters each. A grid of icons or colour
 *      swatches that is right at N-up on a phone says so with `phone-ok`
 *      (a comment on the line or within the three lines above it).
 *
 * Modes:
 *   pnpm check:phone-layout             report (exit 0)
 *   pnpm check:phone-layout --strict    report, exit 1 on any finding
 *   pnpm check:phone-layout --self-test prove the guard can still fail
 *   pnpm check:phone-layout --json      machine-readable findings
 *
 * Allowlist: scripts/phone-layout-allowlist.json — `{file, rule, reason}`
 * rows for a surface that is desktop-only BY RULING (say whose, and when).
 * Never for "it's only admin": admins read this on their phones — that is
 * the report that opened this class.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "features", "components", "lib"];
const ALLOWLIST_PATH = join(ROOT, "scripts", "phone-layout-allowlist.json");

type Rule = "T" | "V" | "G";
interface Finding {
  file: string;
  line: number;
  rule: Rule;
  detail: string;
}
interface AllowRow {
  file: string;
  rule: Rule;
  reason: string;
}

const RULE_TITLE: Record<Rule, string> = {
  T: "fixed-width hand-rolled table with no phone reflow",
  V: "static viewport unit (h-screen / vh) — use dvh",
  G: "dialog grid ≥3 columns with no phone variant",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
}

const TABLE_HEAD_PX = /<TableHead\b[^>]*className="[^"]*\bw-\[\d+px\]/g;
const PHONE_REFLOW =
  /phone-stack|mobileCards|useIsMobile|\b(?:sm|md|lg):hidden\b|\bmax-(?:sm|md|lg):hidden\b/;
const VIEWPORT_STATIC =
  /\b(?:min-|max-)?h-screen\b|\b(?:min-|max-)?h-\[[^\]]*\d+vh[^\]]*\]/g;
const RENDERS_OVERLAY = /<(?:DialogContent|SheetContent|DrawerContent)\b/;
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})/g;
const BASE_GRID = /(?:^|[\s"'`])grid-cols-(\d+)\b/;
const RESPONSIVE_GRID = /\b(?:sm|md|lg|xl|2xl):grid-cols-/;

export function scanSource(source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  const lineOf = (idx: number) => source.slice(0, idx).split("\n").length;

  // T — a desktop-first table (one or more fixed-px columns among three or
  // more) with no reflow. One pinned column beside six fluid ones is the
  // same sideways scroller as seven pinned ones.
  const pxHeads = source.match(TABLE_HEAD_PX);
  const allHeads = source.match(/<TableHead\b/g);
  if (
    pxHeads &&
    allHeads &&
    allHeads.length >= 3 &&
    !PHONE_REFLOW.test(source)
  ) {
    const first = source.search(TABLE_HEAD_PX);
    findings.push({
      file,
      line: lineOf(first),
      rule: "T",
      detail: `${allHeads.length} columns (${pxHeads.length} fixed-px); add <Table wrapperClassName="phone-stack"> + data-label / data-phone hints (or a mobileCards / useIsMobile branch)`,
    });
  }

  // V — static viewport units.
  for (const m of source.matchAll(VIEWPORT_STATIC)) {
    findings.push({
      file,
      line: lineOf(m.index ?? 0),
      rule: "V",
      detail: `${m[0]} → ${m[0].replace("screen", "dvh").replace(/(\d)vh/g, "$1dvh")}`,
    });
  }

  // G — dialog grids.
  if (RENDERS_OVERLAY.test(source)) {
    for (const m of source.matchAll(CLASS_ATTR)) {
      const cls = m[1] ?? m[2] ?? m[3] ?? "";
      const base = BASE_GRID.exec(cls);
      if (!base) continue;
      if (Number(base[1]) < 3) continue;
      if (RESPONSIVE_GRID.test(cls)) continue;
      const ln = lineOf(m.index ?? 0);
      const window = lines.slice(Math.max(0, ln - 4), ln).join("\n");
      if (/phone-ok/.test(window)) continue;
      findings.push({
        file,
        line: ln,
        rule: "G",
        detail: `grid-cols-${base[1]} with no sm:/md: variant → grid-cols-1 sm:grid-cols-${base[1]} (or mark phone-ok with a reason)`,
      });
    }
  }
  return findings;
}

function loadAllowlist(): AllowRow[] {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  const rows = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as AllowRow[];
  for (const r of rows) {
    if (!r.file || !r.rule || !r.reason || r.reason.length < 20) {
      throw new Error(
        `phone-layout-allowlist.json: every row needs file, rule and a real reason (got ${JSON.stringify(r)})`,
      );
    }
  }
  return rows;
}

function scanRepo(): Finding[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) {
    const full = join(ROOT, d);
    if (existsSync(full)) walk(full, files);
  }
  const allow = loadAllowlist();
  const out: Finding[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    for (const finding of scanSource(readFileSync(f, "utf8"), rel)) {
      if (allow.some((a) => a.file === rel && a.rule === finding.rule)) continue;
      out.push(finding);
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function selfTest(): number {
  const cases: Array<[string, string, Rule | null]> = [
    [
      "table without reflow fails",
      `<Table><TableHeader><TableRow><TableHead className="w-[90px]">A</TableHead><TableHead className="w-[50px]">B</TableHead><TableHead>C</TableHead></TableRow></TableHeader></Table>`,
      "T",
    ],
    [
      "table with phone-stack passes",
      `<Table wrapperClassName="phone-stack"><TableHead className="w-[90px]">A</TableHead><TableHead className="w-[50px]">B</TableHead><TableHead>C</TableHead></Table>`,
      null,
    ],
    [
      "table with a mobileCards branch passes",
      `<MatrxDataTable mobileCards={(r) => <Card />} /><TableHead className="w-[90px]"/><TableHead className="w-[50px]"/><TableHead/>`,
      null,
    ],
    ["h-screen fails", `<div className="h-screen" />`, "V"],
    ["max-h-[85vh] fails", `<div className="max-h-[85vh]" />`, "V"],
    ["h-dvh passes", `<div className="h-dvh max-h-[85dvh]" />`, null],
    [
      "dialog grid-cols-3 fails",
      `<DialogContent><div className="grid grid-cols-3 gap-2" /></DialogContent>`,
      "G",
    ],
    [
      "dialog grid with sm: variant passes",
      `<DialogContent><div className="grid grid-cols-1 sm:grid-cols-3 gap-2" /></DialogContent>`,
      null,
    ],
    [
      "dialog grid marked phone-ok passes",
      `<DialogContent>{/* phone-ok: 24px colour swatches */}\n<div className="grid grid-cols-6 gap-1" /></DialogContent>`,
      null,
    ],
    [
      "grid-cols-2 in a dialog passes",
      `<DialogContent><div className="grid grid-cols-2 gap-2" /></DialogContent>`,
      null,
    ],
    [
      "grid-cols-3 outside any overlay is not this rule",
      `<div className="grid grid-cols-3 gap-2" />`,
      null,
    ],
  ];
  let failed = 0;
  for (const [name, src, expect] of cases) {
    const got = scanSource(src, "fixture.tsx");
    const ok = expect === null ? got.length === 0 : got.some((f) => f.rule === expect);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\nself-test FAILED (${failed})` : "\nself-test OK — the guard can fail and can pass");
  return failed ? 1 : 0;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const strict = argv.includes("--strict");
  const findings = scanRepo();
  if (argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
    return strict && findings.length ? 1 : 0;
  }
  if (findings.length === 0) {
    console.log("phone-layout: no findings — every fixed-width table reflows, no static viewport units, no un-reflowed dialog grids.");
    return 0;
  }
  const byRule: Record<Rule, Finding[]> = { T: [], V: [], G: [] };
  for (const f of findings) byRule[f.rule].push(f);
  for (const rule of ["T", "V", "G"] as Rule[]) {
    if (!byRule[rule].length) continue;
    console.log(`\n[${rule}] ${RULE_TITLE[rule]} — ${byRule[rule].length}`);
    for (const f of byRule[rule]) console.log(`  ${f.file}:${f.line}  ${f.detail}`);
  }
  console.log(
    `\nphone-layout: ${findings.length} finding(s). Fix the surface (the ios-mobile-first skill) or add an allowlist row with a ruling — never "admin-only".`,
  );
  return strict ? 1 : 0;
}

if (process.argv[1] && /check-phone-layout\.ts$/.test(process.argv[1])) {
  process.exit(main());
}
