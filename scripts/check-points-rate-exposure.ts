#!/usr/bin/env npx tsx
/**
 * check:points-rate-exposure — a USER-facing surface that shows the points-per-dollar rate or a
 * dollar equivalent of points.
 *
 * THE RULE (Arman, 2026-10-08): "20,000 is correct and should be that for admins to see everywhere
 * and nothing else. Users should never see that number or any conversion." Organization admins are
 * users. The cost display decides by SEAT (`components/cost`: `useSeesDollars()` / `<UsdOnly>` /
 * `<AdminUsd>` / `<Cost>` / `currentSeesDollars()`); no page decides for itself.
 *
 * WHAT THIS FLAGS, outside the admin roots (app/(admin)/, features/admin/, features/administration/,
 * components/cost/) and tests, comments excluded:
 *   R1 `formatAdminUsd(` / `formatAdminCost(` / `formatAdminUsdAxisTick(` — pure dollar formatters that
 *      know no seat — in a file that never asks the seat (`currentSeesDollars`, `useSeesDollars`,
 *      `UsdOnly`) and is not on SEAT_GATED_ELSEWHERE;
 *   R2 the rate written as text: "20,000 points", "points per dollar", "$1 = 20,000 points";
 *   R3 the rate printed: `${rate}` / `{rate}` / `{costRate}` as a template hole or JSX child.
 *
 *   pnpm check:points-rate-exposure
 *   pnpm check:points-rate-exposure --self-test   # every rule fires on a planted line
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "features", "components", "lib", "providers"];
const ADMIN_ROOTS = ["app/(admin)/", "features/admin/", "features/administration/", "components/cost/"];

/** Files outside the admin roots whose dollar formatter only ever runs on a system-admin surface. */
export const SEAT_GATED_ELSEWHERE: Record<string, string> = {
  "features/mandates/admin-list/columns.tsx": "rendered only by the administration mandates list",
  "features/mandates/admin-list/MandateAdminListPage.tsx": "rendered only by the administration mandates list",
  "features/cx-dashboard/components/cx-row-actions.tsx": "copy text of the administration cx dashboard rows",
  "components/official/drill-explorer/measureFormat.ts": "dollars only when the admin-only switch chose them",
  "features/cx-dashboard/explorer/ConversationExplorer.tsx": "rendered only by /administration/chat/cx-dashboard/conversations",
  "features/hindsight/components/FindingEffectivenessPanel.tsx": "rendered only by /administration/agents/hindsight",
};

const SEAT_ASK = /\b(currentSeesDollars|useSeesDollars|UsdOnly)\b/;
const FORMATTER = /\b(formatAdminUsd|formatAdminCost|formatAdminUsdAxisTick)\s*\(/;
const RATE_TEXT = /20,?000\s*(points|pts|credits)|points?\s*(per|=|\/)\s*(\$|dollar|usd)\b|per\s*\$1\b|\$\s?1\s*=\s*[\d,]+\s*(points|pts)/i;
const RATE_PRINT = /\$\{\s*(rate|costRate|pointsRate)\s*\}|>\s*\{\s*(rate|costRate|pointsRate)\s*\}\s*</;

function code(source: string): string[] {
  return source.split("\n").map((l) => (/^\s*(\*|\/\*|\/\/)/.test(l) ? "" : l.replace(/\/\/.*$/, "")));
}

export function isAdminRoot(path: string): boolean {
  return ADMIN_ROOTS.some((r) => path.startsWith(r));
}

/** Pure: the rules a non-admin-root file's source breaks. */
export function exposures(path: string, source: string): string[] {
  if (isAdminRoot(path)) return [];
  const lines = code(source);
  const hits: string[] = [];
  if (!SEAT_ASK.test(source) && !(path in SEAT_GATED_ELSEWHERE) && lines.some((l) => FORMATTER.test(l))) hits.push("R1");
  if (lines.some((l) => RATE_TEXT.test(l))) hits.push("R2");
  const knowsRate = /usePointsRate|useCostDisplay|currentPointsRate/.test(source);
  if (knowsRate && lines.some((l) => !/\bkey=/.test(l) && RATE_PRINT.test(l))) hits.push("R3");
  return hits;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
}

function selfTest(): number {
  const cases: [string, string, string][] = [
    ["R1", "features/x/Panel.tsx", "const t = formatAdminUsd(row.cost);"],
    ["R2", "features/x/Pricing.tsx", 'const a = "20,000 points = $1";'],
    ["R2", "features/x/Pricing.tsx", 'const a = "points per dollar";'],
    ["R3", "features/x/Rate.tsx", "const { rate } = useCostDisplay(); const a = `1 = ${rate} points`;"],
    ["R3", "features/x/Rate.tsx", "const costRate = usePointsRate(); <span>{costRate}</span>"],
  ];
  let failed = 0;
  for (const [rule, path, src] of cases) {
    const ok = exposures(path, src).includes(rule);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${rule} fires on: ${src}`);
  }
  const quiet: [string, string][] = [
    ["features/x/Panel.tsx", "const sees = useSeesDollars(); const t = formatAdminUsd(1);"],
    ["features/admin/x/Panel.tsx", "const t = formatAdminUsd(1); // 20,000 points"],
    ["features/x/Panel.tsx", "// 20,000 points = $1\nconst a = formatCost(1, { rate });"],
  ];
  for (const [path, src] of quiet) {
    const ok = exposures(path, src).length === 0;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} stays quiet: ${src.replace(/\n/g, " ")}`);
  }
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();
  const files: string[] = [];
  for (const d of DIRS) walk(join(ROOT, d), files);
  const bad: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    const hits = exposures(rel, readFileSync(f, "utf8"));
    if (hits.length) bad.push(`${rel}  ${hits.join(" ")}`);
  }
  if (bad.length) {
    console.error("A user-facing surface shows the points rate or a dollar equivalent:\n" + bad.join("\n"));
    console.error("\nUse <Cost/> / <AdminUsd/> / <UsdOnly/> / useSeesDollars() (components/cost), or add the file to SEAT_GATED_ELSEWHERE with its reason.");
    return 1;
  }
  console.log("check:points-rate-exposure: clean");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => exitAfterDrain(c));
}
