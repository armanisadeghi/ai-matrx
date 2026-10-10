/**
 * A COST FORMATTER NEVER READS THE POINTS RATE ONE-SHOT.
 *
 * `currentPointsRate()` is a peek: on a miss it answers null and never re-renders. A formatter that
 * calls it (or defaults its `rate` parameter to it) prints "—" for good when the
 * `billing.points_per_usd` snapshot lands after the data (run history Test tab: "—" for $0.1387).
 * The rate is a required argument; a render passes the SUBSCRIBED rate (`useCostDisplay().rate` /
 * `usePointsRate()`).
 *
 * This test fails when a source file outside `components/cost/` calls `currentPointsRate()` and is not
 * on OUTSIDE_RENDER (each entry names why that read runs at click time, not at render), or when
 * ANY file defaults a parameter to it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "features", "components", "lib", "providers"];

/** Files whose `currentPointsRate()` read runs in a click/copy/async handler, never in a render. */
export const OUTSIDE_RENDER: Record<string, string> = {
  "app/(admin)/administration/chat/cx-dashboard/requests/requests-content.tsx": "copy-text lambda (humanRow)",
  "app/(admin)/administration/chat/cx-dashboard/errors/errors-content.tsx": "copy-text lambda (humanRow)",
  "app/(admin)/administration/applets/executions/page.tsx": "copy-text builder (humanExecution)",
  "features/cx-dashboard/components/cx-row-actions.tsx": "copy-text lines",
  "features/workflow-runtime/components/run/run-copy.ts": "copy-text builder",
  "features/agent-comparison/shared/battleSnapshot.ts": "snapshot text built on click",
  "features/organizations/components/OrgPrivacyTab.tsx": "edit/save click handlers",
  "features/crm/components/record/ContactCandidatesCard.tsx": "confirm dialog text built in a click handler",
  "features/marketing/social/cost.ts": "confirmSocialSpendNow reads the rate after an await, in the click handler that asks for the spend",
  "features/audio/limits.ts": "async estimate built after an await, in the spend-gate handler",
  "features/hindsight/workspace/ReviewerChat.tsx": "toast text after an awaited call",
  "features/hindsight/hooks/useEnrollmentActions.ts": "toast text after an awaited call",
  "features/hindsight/components/DiscussPanel.tsx": "toast text after an awaited call",
  "features/content-ir/kinds/generated-audio.ts": "markdown serializer for copy/export, run at call time",
  "features/content-ir/kinds/generated-image-set.ts": "markdown serializer for copy/export, run at call time",
  "features/content-ir/kinds/generated-video-set.ts": "markdown serializer for copy/export, run at call time",
};

const CALL = /\bcurrentPointsRate\s*\(\s*\)/;
const DEFAULT_PARAM = /[=]\s*currentPointsRate\s*\(\s*\)\s*[,)]/;

function code(source: string): string[] {
  return source.split("\n").map((line) => (/^\s*(\*|\/\*|\/\/)/.test(line) ? "" : line.replace(/\/\/.*$/, "")));
}

/** Pure: which rule (if any) a file's source breaks. */
export function oneShotRateReads(source: string): { call: boolean; defaultParam: boolean } {
  const lines = code(source);
  return {
    call: lines.some((l) => CALL.test(l)),
    defaultParam: lines.some((l) => DEFAULT_PARAM.test(l)),
  };
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
}

describe("no cost formatter reads the points rate one-shot", () => {
  it("detects the old costWords shape (red on the pre-fix code)", () => {
    const old = `export function costWords(cost: number | null, unit: CostUnit = currentCostUnit()): string {
  return formatCost(cost, { rate: currentPointsRate(), unit });
}`;
    expect(oneShotRateReads(old).call).toBe(true);
    const oldDefault = `export function money(usd, unit, rate: number | null = currentPointsRate()) {}`;
    expect(oneShotRateReads(oldDefault).defaultParam).toBe(true);
    const fixed = `export function costWords(cost: number | null, rate: number | null, unit: CostUnit) {
  return formatCost(cost, { rate, unit });
}`;
    expect(oneShotRateReads(fixed)).toEqual({ call: false, defaultParam: false });
  });

  it("every file outside components/cost reads the rate reactively or is a named outside-render site", () => {
    const files: string[] = [];
    for (const d of DIRS) walk(join(ROOT, d), files);
    const bad: string[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (rel.startsWith("components/cost/")) continue;
      const hit = oneShotRateReads(readFileSync(file, "utf8"));
      if (hit.defaultParam) bad.push(`${rel}: a parameter defaults to currentPointsRate()`);
      if (hit.call) {
        seen.add(rel);
        if (!(rel in OUTSIDE_RENDER)) bad.push(`${rel}: calls currentPointsRate() in a formatter — take the subscribed rate (useCostDisplay().rate) as an argument`);
      }
    }
    const stale = Object.keys(OUTSIDE_RENDER).filter((f) => !seen.has(f)).map((f) => `${f}: allowlisted but no longer reads it — remove`);
    expect([...bad, ...stale]).toEqual([]);
  });
});
