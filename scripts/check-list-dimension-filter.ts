/**
 * check:list-dimension-filter — EVERY CANONICAL LIST HEADER CARRIES THE DIMENSION CONTROL
 * (lane 3 INTEGRATION, W1.5, guard 6; 2026-10-02).
 *
 *   All | Mine | My team | My Orgs | Shared | Public | System   [ Any dimension ▾ ] [ All organizations ▾ ]
 *
 * The Dimension filter is built ONCE in the shell (lib/entity-list): `EntityDimensionFilter` in the
 * control row of `EntityListPage`, beside `EntityOrgFilter`. A surface turns it on with
 * `config.dimensionFilter: true` when its list RPC applies `platform.list_dimension_match`; `false`
 * says its server does not narrow by it yet, so the control is absent rather than dead.
 *
 * RULE A (the header). lib/entity-list/components/EntityListPage.tsx renders `<EntityDimensionFilter`
 * inside the `data-entity-list-control-row` element, in the same row as `<EntityOrgFilter`, and hands
 * it `dimensionValueOf(` / `withDimensionValue(` (the one state, in the URL-backed filter bag).
 * RULE B (the census). Every file that declares an `EntityListConfig` object says `dimensionFilter:`
 * — true or false. Files that do not yet are rows of the SHRINK-ONLY baseline
 * (`scripts/list-dimension-filter-baseline.json`): a new list fails, and a baselined file that now
 * declares fails until its row is removed.
 *
 * `--self-test` proves RED on in-memory plants (the control removed from the header; a new config
 * without the declaration; a stale baseline row) and GREEN on the real tree. Nothing on disk is mutated.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const SHELL = "lib/entity-list/components/EntityListPage.tsx";
const BASELINE = "scripts/list-dimension-filter-baseline.json";
const SCAN_DIRS = ["app", "features", "components", "lib", "packages"] as const;

/** A file that declares an EntityListConfig object (typed const, typed return, or useMemo). */
const DECLARES_CONFIG = /:\s*EntityListConfig<[^>]+>\s*=\s*\{|\)\s*:\s*EntityListConfig<[^>]+>\s*\{|useMemo<EntityListConfig</;
const DECLARES_DIMENSION = /\bdimensionFilter\s*:/;

export function checkHeader(src: string): string[] {
  const out: string[] = [];
  const row = src.indexOf("data-entity-list-control-row");
  const rowEnd = src.indexOf("<EntityFilterChips", row);
  if (row < 0 || rowEnd < 0) return [`${SHELL}: cannot find the header control row`];
  const body = src.slice(row, rowEnd);
  if (!body.includes("<EntityDimensionFilter")) out.push(`${SHELL}: the header control row does not render <EntityDimensionFilter>`);
  if (!body.includes("<EntityOrgFilter")) out.push(`${SHELL}: the header control row does not render <EntityOrgFilter>`);
  if (!body.includes("dimensionValueOf(") || !body.includes("withDimensionValue("))
    out.push(`${SHELL}: the Dimension control is not wired to the query's filter bag (dimensionValueOf / withDimensionValue)`);
  return out;
}

export function checkCensus(files: ReadonlyMap<string, string>, baseline: readonly string[]): string[] {
  const out: string[] = [];
  const base = new Set(baseline);
  for (const [path, src] of files) {
    if (!DECLARES_CONFIG.test(src)) continue;
    const declares = DECLARES_DIMENSION.test(src);
    if (!declares && !base.has(path))
      out.push(`${path}: declares an EntityListConfig without \`dimensionFilter:\` (true when its list RPC applies platform.list_dimension_match, else false)`);
    if (declares && base.has(path)) out.push(`${path}: now declares dimensionFilter — remove its row from ${BASELINE}`);
  }
  for (const path of base) {
    const src = files.get(path);
    if (src === undefined || !DECLARES_CONFIG.test(src)) out.push(`${path}: baseline row for a file that no longer declares a config — remove it`);
  }
  return out;
}

function scan(): Map<string, string> {
  const files = new Map<string, string>();
  for (const f of repoFiles(REPO_ROOT, { under: [...SCAN_DIRS], match: /\.(ts|tsx)$/ })) {
    if (!/\.(ts|tsx)$/.test(f) || /__tests__|\.test\.|\.spec\./.test(f)) continue;
    files.set(f, readFileSync(join(REPO_ROOT, f), "utf8"));
  }
  return files;
}

function readBaseline(): string[] {
  return (JSON.parse(readFileSync(join(REPO_ROOT, BASELINE), "utf8")) as { files: string[] }).files;
}

function run(): number {
  const files = scan();
  const failures = [...checkHeader(files.get(SHELL) ?? ""), ...checkCensus(files, readBaseline())];
  if (failures.length) {
    console.error(`check:list-dimension-filter — ${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log(`check:list-dimension-filter — OK (header carries the control; every list config declares it or is baselined)`);
  return 0;
}

function selfTest(): number {
  const files = scan();
  const shell = files.get(SHELL) ?? "";
  const baseline = readBaseline();
  const cases: Array<[string, string[], boolean]> = [];
  // RED 1: the control removed from the header.
  cases.push(["header without the control", checkHeader(shell.replaceAll("<EntityDimensionFilter", "<SomethingElse")), true]);
  // RED 2: a new list config that does not declare.
  const planted = new Map(files);
  planted.set("features/planted/listConfig.tsx", `export const x: EntityListConfig<Row> = { surfaceKey: "planted" };`);
  cases.push(["new config without the declaration", checkCensus(planted, baseline), true]);
  // RED 3: a baselined file that now declares.
  if (baseline[0]) {
    const stale = new Map(files);
    stale.set(baseline[0], `${files.get(baseline[0])}\nconst y = { dimensionFilter: false };`);
    cases.push(["stale baseline row", checkCensus(stale, baseline), true]);
  }
  // GREEN: the real tree.
  cases.push(["real tree", [...checkHeader(shell), ...checkCensus(files, baseline)], false]);
  let bad = 0;
  for (const [name, failures, wantRed] of cases) {
    const red = failures.length > 0;
    const ok = red === wantRed;
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"} ${wantRed ? "RED " : "GREEN"} ${name}${red ? ` — ${failures[0]}` : ""}`);
  }
  return bad ? 1 : 0;
}

const args = process.argv.slice(2);
if (args.includes("--write-baseline")) {
  const files = scan();
  const missing = [...files].filter(([, s]) => DECLARES_CONFIG.test(s) && !DECLARES_DIMENSION.test(s)).map(([p]) => p).sort();
  writeFileSync(join(REPO_ROOT, BASELINE), `${JSON.stringify({ note: "Lists on the canonical shell whose list RPC does not apply platform.list_dimension_match yet. Shrink-only.", files: missing }, null, 2)}\n`);
  console.log(`wrote ${missing.length} rows to ${BASELINE}`);
  process.exit(0);
}
process.exit(args.includes("--self-test") ? selfTest() : run());
