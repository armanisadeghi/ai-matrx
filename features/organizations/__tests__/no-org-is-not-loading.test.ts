/**
 * "NO ORG YET" IS NOT "STILL READING" — the class, mechanically enforced.
 *
 * The shape: a component or hook starts a busy state as the truth
 * (`loading = useState(true)`, `status: "loading"`, or a `rows: T[] | null`
 * whose `null` paints a spinner) and its load effect begins with a bare
 * `if (!organizationId) return;`. While the organization bootstrap is still
 * resolving that is correct — loading IS the truth. But once the bootstrap has
 * resolved and there is still no organization selected, nothing ever flips the
 * busy state: the skeleton stays up FOREVER and says nothing about why.
 *
 * This exact defect was found and fixed, one instance at a time, in
 * `useMandateInputSurface` ("Reading what this job offers…" for 20 s, V3 F4),
 * in two more readers V3 caught, and in `MandatesConsole` (an independent
 * production walk, 2026-08-31). The fourth time it was fixed as a class
 * (2026-09-11): every busy-gated reader now also reads
 * `selectOrgBootstrapResolved` and, once resolved with no organization, stops
 * loading and prints the settled fact with its remedy.
 *
 * WHAT THIS GUARD PINS
 *  1. Every file in the fixed census still carries the fix: it reads the
 *     bootstrap authority and names the remedy on screen.
 *  2. No file under `features/` re-grows the shape: a busy-initialised state
 *     plus a bare organization early return, with no bootstrap read and no
 *     architectural gate. A new offender fails here with its path, and the
 *     fix is to copy `MandatesConsole.tsx`, or to add it to LEFT_ALONE with
 *     the reason it cannot stick.
 *
 * WHAT IS DELIBERATELY EXEMPT (and why — each is a fact checked 2026-09-11)
 *  - HR: `useHrContext` surfaces sit under `HrPageState` / `HrSettingsChrome`,
 *    which render the employer picker AS THE PAGE before any surface's own
 *    `loading` is consulted; `useHrKnobs` / `useHrSettingsStructure` derive
 *    `isLoading` as false when there is no employer.
 *  - Files that already render an honest no-organization branch
 *    (`if (!organizationId) return (<sentence>)`) cannot stick; they may flash
 *    before the bootstrap, which is a different, milder defect.
 *  - Write paths, refreshers and callbacks with no busy state to leave stuck.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/** The files fixed as a class on 2026-09-11, plus the four earlier instances. */
const FIXED_CENSUS = [
  "features/mandates/admin/MandatesConsole.tsx",
  "features/mandates/input-surface.ts",
  "features/mandates/admin/MandateReferenceBoardView.tsx",
  "features/mandates/admin/MandateSourceUsage.tsx",
  "features/workflow-runtime/triggers/useWorkflowTriggers.ts",
  "features/workflow-runtime/served-form/useServedRunForm.ts",
  "features/workflow-runtime/kind-emissions/useResultSchema.ts",
  "features/commerce-intake/components/IntakeAnswerQueue.tsx",
  "features/product-capture/components/pipeline/AnswerQueue.tsx",
  "features/product-capture/components/AllItemsTable.tsx",
  "features/product-capture/components/pipeline/PipelineWorkspace.tsx",
  "features/product-capture/components/ItemsSheet.tsx",
];

/**
 * Files that match the shape mechanically but cannot stick, with the reason.
 * Adding a line here is a claim you have verified on the real screen.
 */
const LEFT_ALONE: Record<string, string> = {
  "features/organizations/hooks/useOrgAutoRagPreference.ts":
    "the load effect already sets loading=false on no org; the bare returns are the write setters.",
  "features/organizations/admin/hooks.ts":
    "orgId is the [orgId] route segment — a string, never null, on every caller.",
  "features/entitlements/components/PlanUsagePanel.tsx":
    "renders 'Pick an organization to see its plan.' at render time when the id is null.",
  "features/commerce-review/components/AttentionQueue.tsx":
    "renders 'Pick an organization first.' at render time when the id is null.",
  "features/commerce-review/components/DraftReviewQueue.tsx":
    "renders 'Pick an organization first.' at render time when the id is null.",
  "features/commerce-review/components/TriageQueue.tsx":
    "renders 'Pick an organization first.' at render time when the id is null.",
  "features/crm/components/import/ConnectorSources.tsx":
    "returns null (absent, not busy) when the wizard has no organization.",
};

const ORG_EARLY_RETURN =
  /if \(!(organizationId|orgId|selectedOrganizationId)\) return;/;
const BUSY_INIT: RegExp[] = [
  /\[(is)?[lL]oading, set\w+\] = useState(<boolean>)?\(true\)/,
  /useState<[^>]*>\(\{\s*status: "loading"/,
  /state: \{ status: "loading" \}/,
];
/** `rows: T[] | null` where null is painted as a spinner or a table's loading. */
const NULL_LIST_INIT = /useState<[^>]*\[\] \| null>\(null\)/;
const NULL_PAINTS_BUSY = /animate-spin|isLoading=\{|loading=\{/;

const BOOTSTRAP_READ = "selectOrgBootstrapResolved";
const HR_GATE = "useHrContext";
const SETTLED_SENTENCE = "No organization is selected";

function filesUnder(relativePath: string): string[] {
  const absolute = join(REPO_ROOT, relativePath);
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === "__tests__" || entry === "node_modules") return [];
    const child = join(relativePath, entry);
    if (statSync(join(REPO_ROOT, child)).isDirectory()) return filesUnder(child);
    if (/\.test\.tsx?$/.test(entry)) return [];
    return /\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
}

function hasBusyInit(source: string): boolean {
  if (BUSY_INIT.some((re) => re.test(source))) return true;
  return NULL_LIST_INIT.test(source) && NULL_PAINTS_BUSY.test(source);
}

describe('"no org yet" is not "still reading"', () => {
  it("every fixed reader still reads the bootstrap authority and names the remedy", () => {
    for (const relative of FIXED_CENSUS) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(`${relative}: ${BOOTSTRAP_READ}`).toBe(
        source.includes(BOOTSTRAP_READ)
          ? `${relative}: ${BOOTSTRAP_READ}`
          : `${relative}: MISSING ${BOOTSTRAP_READ}`,
      );
      expect(`${relative}: ${SETTLED_SENTENCE}`).toBe(
        source.includes(SETTLED_SENTENCE)
          ? `${relative}: ${SETTLED_SENTENCE}`
          : `${relative}: MISSING "${SETTLED_SENTENCE}"`,
      );
    }
  });

  it("no busy-gated reader under features/ bares an organization early return without the bootstrap", () => {
    const offenders: string[] = [];
    for (const relative of filesUnder("features")) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      if (!ORG_EARLY_RETURN.test(source)) continue;
      if (!hasBusyInit(source)) continue;
      if (source.includes(BOOTSTRAP_READ)) continue;
      if (source.includes(HR_GATE)) continue;
      if (relative in LEFT_ALONE) continue;
      offenders.push(relative);
    }
    expect(offenders).toEqual([]);
  });

  it("LEFT_ALONE names only files that still exist and still match the shape", () => {
    // A stale entry is a dead exemption waiting to hide a real offender.
    for (const relative of Object.keys(LEFT_ALONE)) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      expect(`${relative} matches`).toBe(
        ORG_EARLY_RETURN.test(source) && hasBusyInit(source)
          ? `${relative} matches`
          : `${relative} no longer matches — drop it from LEFT_ALONE`,
      );
    }
  });
});
