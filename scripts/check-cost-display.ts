#!/usr/bin/env npx tsx
/**
 * check:cost-display — a UI file that shows a person a COST in dollars.
 *
 * THE RULE (Arman, 2026-09-27): "No one talks cost to a normal user, only api
 * users. For normal users, they use points or credits … Everyone should see
 * credits/points except for system admins who should always be able to toggle
 * to see $." Every AI/run cost therefore renders through ONE primitive:
 * `<Cost usd={…}/>` / `<CostBadge/>` / `useCostDisplay().format` in
 * `components/cost/`, built on `formatCost` in `@ai-matrx/kit/format`
 * at the rate of the `billing.points_per_usd` knob — the same rate
 * `aidream/services/billing/ai_points.py` banks. A member sees points; only a system admin who flipped the switch in
 * the header menu's Admin group sees dollars.
 *
 * WHAT THIS FLAGS, per file (comments excluded):
 *   R1 `formatUsd(`                       — the kit's raw dollar formatter;
 *   R2 `currency: "USD"`                  — an Intl dollar formatter;
 *   R3 `<cost/usd/spend/savings name>.toFixed(` or `(… ?? 0).toFixed(`
 *                                          — a hand-rolled dollar figure;
 *   R4 `"$" + …`                          — a hand-glued dollar sign.
 *
 * AND THE OTHER HALF OF THE RULING — a cost that IGNORES THE ADMIN SWITCH
 * (always points, even for an admin who asked for dollars). No baseline; any
 * hit fails:
 *   R5 `unit: CostUnit = "points"` / `unit = "points"` — a helper whose
 *      default silently drops the switch; default to `currentCostUnit()`
 *      (`components/cost/costUnit.ts`) or take the unit from the hook;
 *   R6 `formatCost(…)` imported from `@ai-matrx/kit/format` and called with
 *      no `unit` — kit's default is points, so the switch never reaches it.
 *
 * AND THE RATE (Arman, 2026-09-30: the points-per-dollar rate is ONE setting,
 * the `billing.points_per_usd` knob). Kit's `formatCost` / `usdToPoints` /
 * `pointsToUsd` take `{ rate }` from the caller; the host reads it through
 * `currentPointsRate()` / `useCostDisplay().rate` (`components/cost/pointsRate.ts`):
 *   R7 a kit points call whose `rate` is a number literal — a second copy of
 *      the setting that an organization's rate (or the platform's) never reaches.
 *
 * NOT FLAGGED: `components/cost/**` (the primitive), tests, scripts, and the
 * DOMAIN_MONEY files below — real money that is not what the platform charged
 * for AI work (a worker's pay, a course price, a keyword's CPC, a print order's
 * price). Each carries its reason; a file whose rule no longer fires there
 * fails as STALE so the list cannot rot.
 *
 * THE BASELINE IS A RATCHET (`scripts/cost-display-baseline.json`): per-file
 * counts of cost sites not yet converted. New file or higher count = exit 1;
 * `--write` ratchets it down (never up).
 *
 *   pnpm check:cost-display
 *   pnpm check:cost-display --write       # ratchet down / seed
 *   pnpm check:cost-display --self-test   # every rule fires on a planted line
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
// The fleet's money SHAPE detector (template `$${x}`, `"$" + x`, Intl currency
// formatters and every `.format()` on them, labelled `.toFixed`, cents
// division) — reused so a helper named `fmt(n)` cannot hide a dollar sign.
import { moneyShapeIn } from "./money-shape.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "cost-display-baseline.json");

/** Real money that is not platform cost — dollars are the truth here. */
export const DOMAIN_MONEY: Record<string, string> = {
  "features/hr/time/shared/format.ts": "a worker's pay",
  "features/hr/people/profile/tabs/CompensationTab.tsx": "a worker's compensation",
  "features/hr/people/profile/ProposePayChange.tsx": "a proposed pay change",
  "features/legal/wc/pd-ratings/lib/formulas.ts": "a workers'-comp award amount",
  "features/education/creators/components/EnrollButton.tsx": "a course's price to a student",
  "features/marketing/link-valuation/configs/matrx-v1.ts": "a backlink's market value",
  "features/marketing/link-valuation/configs/sheet-2018.ts": "a backlink's market value",
  "features/marketing/seo/keyword-research/format.ts": "a keyword's cost-per-click in the ad market",
  "features/product-capture/components/pipeline/ResearchPanel.tsx": "a product's sale price",
  "features/education/creators/components/CreatorLandingPage.tsx": "a course's price to a student",
  "features/education/creators/components/CreatorDashboard.tsx": "a creator's earnings",
  "features/education/classes/components/ClassFormDialog.tsx": "a class's tuition",
  "features/print/order/lulu-api.ts": "a print order's price",
  "features/print/order/OrderFlow.tsx": "a print order's price",
  "components/mardown-display/blocks/print-kinds/print-kind-blocks.tsx": "a print quote's price",
  "components/mardown-display/blocks/commerce-kinds/commerce-kind-blocks.tsx": "a product's price",
  "features/crm/deals/types.ts": "a sales deal's value",
  "features/hr/me/MyPaySurface.tsx": "a worker's pay",
  "features/legal/wc/pd-ratings/components/workspace/RatingBreakdownTable.tsx": "a workers'-comp award amount",
  "features/marketing/seo/domain-research/DomainResearchPage.tsx": "a keyword's cost-per-click in the ad market (the CPC column)",
  "features/marketing/ads/GoogleAdsWorkspace.tsx": "the customer's own Google Ads spend",
  "features/marketing/initiatives/columns.tsx": "a marketing initiative's budget",
  "features/marketing/initiatives/InitiativeDetail.tsx": "a marketing initiative's budget",
  "features/marketing/link-valuation/components/ResultPanel.tsx": "a backlink's market value",
  "features/marketing/link-valuation/engine.ts": "a backlink's market value",
  "features/marketing/seo/keyword-research/components/KeywordMetrics.tsx": "a keyword's cost-per-click in the ad market",
  "features/pricing/education/EducationPricing.tsx": "our subscription plan prices",
  "features/entitlements/catalog/format.ts": "our subscription plan prices (formatCents, every billing.plan price)",
  "features/admin/limits/types.ts": "our subscription plan prices on the admin limits matrix",
  "app/(public)/templates/[slug]/social-image/route.tsx": "a currency-typed field value from a template's sample record, drawn into its share image",
  "features/make/gallery/TemplateShowcase.tsx": "a currency-typed field value in a template's sample rows",
  "features/scopes/components/reference/ContextValueDisplay.tsx": "a person's own currency-typed value",
  "features/ai-models/components/ModelPricingEditor.tsx": "the provider's USD price list an admin edits",
  "features/ai-models/components/ProviderPriceCell.tsx": "the provider's USD price list an admin syncs",
  "features/ai-models/utils/providerSyncPricing.ts": "the provider's USD price list an admin syncs",
  "features/admin/dated-changes/describe.ts": "the provider's per-million-token USD price schedule, shown only in the admin attention queue",
  "../aidream/apps/shared/chat/src/action-requests/components/spendAmount.ts": "the approve-spend amount box's dollar text, reached ONLY when the viewer's unit is usd (a system admin's switch); members type points",
  "features/tool-call-visualization/admin/ToolTestSamplesViewer.tsx": "the provider's per-million-token USD price list, shown to an admin debugging a tool-test sample's cost estimate",
};

const SKIP_PREFIXES = ["components/cost/", "scripts/", "node_modules/", ".next/"];

const RULES: { id: string; re: RegExp }[] = [
  { id: "R1 formatUsd(", re: /\bformatUsd\s*\(/g },
  { id: "R2 Intl USD", re: /currency:\s*["'`]USD["'`]/g },
  {
    id: "R3 cost.toFixed",
    re: /\b[\w.?]*(?:[cC]ost|[uU]sd|USD|[sS]pend|[sS]avings)[\w?]*\s*\)?\s*\.toFixed\s*\(/g,
  },
  {
    id: "R3 (cost ?? 0).toFixed",
    re: /\(\s*[\w.?]*(?:[cC]ost|[uU]sd|USD|[sS]pend|[sS]avings)[\w.?]*\s*(?:\?\?\s*0\s*)?\)\s*\.toFixed\s*\(/g,
  },
  { id: "R4 \"$\" +", re: /["'`]\$["'`]\s*\+/g },
];

/** How many LINES of one file's source show money: THE shape detector's
 *  findings plus this guard's cost rules, each line counted once. Pure. */
export function countCostSites(source: string): number {
  const lines = new Set<number>();
  for (const hit of moneyShapeIn(source) as { line: number }[]) lines.add(hit.line);
  source.split("\n").forEach((line, i) => {
    if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
    const code = line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1").replace(/\/\*.*?\*\//g, " ");
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (rule.re.test(code)) {
        lines.add(i + 1);
        break;
      }
    }
  });
  return lines.size;
}

function isUiFile(file: string): boolean {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".d.ts")) return false;
  if (/(^|\/)__(tests|fixtures)__\//.test(file) || /\.(test|spec)\.tsx?$/.test(file)) return false;
  if (SKIP_PREFIXES.some((p) => file.startsWith(p))) return false;
  return /^(app|features|components|lib|hooks|providers|utils)\//.test(file);
}

const KIT_POINTS_CALLS = ["formatCost", "usdToPoints", "pointsToUsd"] as const;

/** R7 — lines where a kit points call hard-codes its rate. Pure. */
export function literalRateSites(source: string): number[] {
  const hits = new Set<number>();
  const kitImport = source.match(/import\s*\{([^}]*)\}\s*from\s*["']@ai-matrx\/kit\/format["']/);
  if (!kitImport) return [];
  const locals: string[] = [];
  for (const spec of kitImport[1].split(",")) {
    const m = spec.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);
    if (m && (KIT_POINTS_CALLS as readonly string[]).includes(m[1])) locals.push(m[2] ?? m[1]);
  }
  for (const name of locals) {
    const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      let depth = 0;
      let j = m.index + m[0].length - 1;
      for (; j < source.length; j++) {
        const ch = source[j];
        if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) break;
      }
      const args = source.slice(m.index + m[0].length, j);
      if (/\brate\s*:\s*[-+]?[\d.]/.test(args)) hits.add(source.slice(0, m.index).split("\n").length);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

/** R5/R6 — lines where a cost ignores the admin's dollars switch. Pure. */
export function switchIgnoredSites(source: string): number[] {
  const hits = new Set<number>();
  const lines = source.split("\n");
  const importsKitFormatCost =
    /import\s*(?:type\s*)?\{[^}]*\bformatCost\b[^}]*\}\s*from\s*["']@ai-matrx\/kit\/format["']/.test(source);
  lines.forEach((line, i) => {
    if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
    if (/\bCostUnit\s*=\s*["']points["']|\bunit\s*=\s*["']points["']/.test(line)) hits.add(i + 1);
  });
  if (importsKitFormatCost) {
    const re = /\bformatCost\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const before = source.slice(Math.max(0, m.index - 16), m.index);
      if (/function\s+$/.test(before) || /\.\s*$/.test(before)) continue;
      let depth = 0;
      let j = m.index + m[0].length - 1;
      for (; j < source.length; j++) {
        const ch = source[j];
        if (ch === "(") depth++;
        else if (ch === ")" && --depth === 0) break;
      }
      const args = source.slice(m.index + m[0].length, j);
      if (!/\bunit\b/.test(args)) hits.add(source.slice(0, m.index).split("\n").length);
    }
  }
  return [...hits].sort((a, b) => a - b);
}

type Counts = Record<string, number>;

function scanTree(): {
  counts: Counts;
  staleDomain: string[];
  switchIgnored: string[];
  literalRates: string[];
} {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.ts", "*.tsx"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\n")
    .filter(Boolean);
  const counts: Counts = {};
  const staleDomain: string[] = [];
  const switchIgnored: string[] = [];
  const literalRates: string[] = [];
  for (const file of listed) {
    if (!isUiFile(file)) continue;
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    for (const line of switchIgnoredSites(source)) switchIgnored.push(`${file}:${line}`);
    for (const line of literalRateSites(source)) literalRates.push(`${file}:${line}`);
    const n = countCostSites(source);
    if (file in DOMAIN_MONEY) {
      if (n === 0) staleDomain.push(file);
      continue;
    }
    if (n > 0) counts[file] = n;
  }
  for (const file of Object.keys(DOMAIN_MONEY)) {
    if (!existsSync(join(ROOT, file)) && !staleDomain.includes(file)) staleDomain.push(file);
  }
  return { counts, staleDomain: staleDomain.sort(), switchIgnored, literalRates };
}

export interface Verdict {
  newSites: { file: string; count: number; baseline: number }[];
  cleared: string[];
}

/** New = a file above its baseline count (absent = 0). Pure. */
export function judge(current: Counts, baseline: Counts): Verdict {
  const newSites = Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => ({ file, count, baseline: baseline[file] ?? 0 }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const cleared = Object.keys(baseline)
    .filter((file) => (current[file] ?? 0) < baseline[file])
    .sort();
  return { newSites, cleared };
}

function readBaseline(): Counts | null {
  if (!existsSync(BASELINE_FILE)) return null;
  return JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Counts;
}

function writeBaseline(counts: Counts): void {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

function selfTest(): number {
  const cases: { name: string; source: string; want: number }[] = [
    { name: "R1 kit formatUsd", source: `<span>{formatUsd(run.costUsd, { digits: "adaptive" })}</span>`, want: 1 },
    { name: "R2 Intl currency", source: `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`, want: 1 },
    { name: "R3 JSX toFixed", source: `<span>${"{"}arm.cost_usd.toFixed(3)}</span>`, want: 1 },
    { name: "R3 template toFixed", source: "const s = `$${view.costUsd.toFixed(4)}`;", want: 1 },
    { name: "R3 optional chain", source: "`${m.total_cost?.toFixed(2)}`", want: 1 },
    { name: "R3 nullish group", source: "`$${(row.spendUsd ?? 0).toFixed(2)}`", want: 1 },
    { name: "R4 glued dollar", source: `const s = "$" + total;`, want: 1 },
    { name: "the primitive", source: `<Cost usd={run.costUsd} />`, want: 0 },
    { name: "the hook", source: `const { format } = useCostDisplay(); format(costUsd)`, want: 0 },
    { name: "a duration", source: "`${seconds.toFixed(1)}s`", want: 0 },
    { name: "a comment", source: `// formatUsd(cost) is banned; "$" + x too`, want: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = countCostSites(c.source);
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  const ratchet = judge({ "a.tsx": 2, "b.tsx": 1, "c.tsx": 1 }, { "a.tsx": 2, "b.tsx": 2 });
  const ratchetOk =
    ratchet.newSites.length === 1 && ratchet.newSites[0].file === "c.tsx" && ratchet.cleared.join() === "b.tsx";
  if (!ratchetOk) failed++;
  console.log(`${ratchetOk ? "PASS" : "FAIL"}  ratchet: a new file fails, a lower count is cleared`);
  const KIT = `import { formatCost } from "@ai-matrx/kit/format";\n`;
  const switchCases: { name: string; source: string; want: number }[] = [
    { name: "R5 literal points default", source: `function f(v: number, unit: CostUnit = "points") {}`, want: 1 },
    { name: "R5 destructured points default", source: `const { unit = "points" } = input;`, want: 1 },
    { name: "R6 kit formatCost with no unit", source: `${KIT}const s = formatCost(run.costUsd);`, want: 1 },
    { name: "R6 multi-line call with no unit", source: `${KIT}const s = formatCost(\n  Number(r.cost),\n);`, want: 1 },
    { name: "R6 kit formatCost with the unit", source: `${KIT}const s = formatCost(x, { unit });`, want: 0 },
    { name: "R6 unit read at call time", source: `${KIT}formatCost(x, { unit: currentCostUnit() })`, want: 0 },
    { name: "R6 a local wrapper named formatCost", source: `export function formatCost(v: number, unit: CostUnit = currentCostUnit()) {}\nformatCost(3);`, want: 0 },
    { name: "R5 default read from the store", source: `function f(unit: CostUnit = currentCostUnit()) {}`, want: 0 },
  ];
  for (const c of switchCases) {
    const got = switchIgnoredSites(c.source).length;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  const KIT_POINTS = `import { formatCost, usdToPoints as toPts } from "@ai-matrx/kit/format";\n`;
  const rateCases: { name: string; source: string; want: number }[] = [
    { name: "R7 literal rate on formatCost", source: `${KIT_POINTS}formatCost(x, { unit, rate: 20000 })`, want: 1 },
    { name: "R7 literal rate through an alias", source: `${KIT_POINTS}toPts(x, {\n  rate: 20_000,\n})`, want: 1 },
    { name: "R7 rate from the knob", source: `${KIT_POINTS}formatCost(x, { unit, rate: currentPointsRate() })`, want: 0 },
    { name: "R7 rate from the hook", source: `${KIT_POINTS}toPts(x, { rate })`, want: 0 },
    { name: "R7 a file that does not use kit", source: `formatCost(x, { rate: 5 })`, want: 0 },
  ];
  for (const c of rateCases) {
    const got = literalRateSites(c.source).length;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got ${got}, want ${c.want}`);
  }
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const { counts: current, staleDomain, switchIgnored, literalRates } = scanTree();
  const baseline = readBaseline();
  if (args.has("--write")) {
    if (!baseline) {
      writeBaseline(current);
      console.log(`Seeded ${BASELINE_FILE} with ${Object.keys(current).length} files.`);
      return 0;
    }
    const ratcheted: Counts = {};
    for (const [file, count] of Object.entries(baseline)) {
      const now = Math.min(count, current[file] ?? 0);
      if (now > 0) ratcheted[file] = now;
    }
    writeBaseline(ratcheted);
    console.log(`Ratcheted baseline to ${Object.keys(ratcheted).length} files.`);
    return 0;
  }

  const verdict = judge(current, baseline ?? {});
  let code = 0;
  if (staleDomain.length > 0) {
    console.log("FAIL: DOMAIN_MONEY entries no longer format dollars (or are gone) — delete them:");
    for (const file of staleDomain) console.log(`  STALE  ${file}`);
    code = 1;
  }
  if (switchIgnored.length > 0) {
    console.log(
      `FAIL: a cost ignores the system-admin "Show costs in dollars" switch (always points). Take the unit from useCostDisplay() in render, or default it to currentCostUnit() (components/cost/costUnit.ts) for copy text, toasts and payloads:`,
    );
    for (const site of switchIgnored) console.log(`  SWITCH  ${site}`);
    code = 1;
  }
  if (literalRates.length > 0) {
    console.log(
      "FAIL: a points conversion hard-codes its rate. The rate is ONE setting, the billing.points_per_usd knob: pass currentPointsRate() or useCostDisplay().rate (components/cost/pointsRate.ts):",
    );
    for (const site of literalRates) console.log(`  RATE  ${site}`);
    code = 1;
  }
  if (verdict.newSites.length > 0) {
    console.log(
      `FAIL: a cost is shown in dollars. Render it with <Cost usd={…}/> (components/cost/Cost.tsx) or useCostDisplay().format — everyone sees points; only a system admin who flipped "Show costs in dollars" sees $. Real money that is not platform cost goes in DOMAIN_MONEY with its reason.`,
    );
    for (const site of verdict.newSites) {
      console.log(`  NEW  ${site.file}  (${site.count} site${site.count === 1 ? "" : "s"}, baseline ${site.baseline})`);
    }
    code = 1;
  }
  if (code === 0) {
    const remaining = Object.keys(current).length;
    console.log(
      `OK: no new dollar-formatted cost. ${remaining} baseline file${remaining === 1 ? "" : "s"} still to convert.` +
        (verdict.cleared.length > 0
          ? ` ${verdict.cleared.length} cleared since the baseline — run --write to ratchet it down.`
          : ""),
    );
  }
  return code;
}

exitAfterDrain(main());
