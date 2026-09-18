/**
 * check-org-three-states — a REFUSAL is never derived from a nullable id.
 *
 * THE CLASS this guards
 * ---------------------
 * `check-org-refusal-honesty` proves a module that resolves an organization
 * SHOWS the person something. It cannot see the defect one level in: a module
 * that shows the right sentence at the WRONG TIME.
 *
 * `appContext.organization_id === null` means three different things
 * (`features/organizations/useOrganizationRequired.ts` names all three): boot
 * has not answered yet, boot answered with nothing, or — for a control — the
 * caller was handed nothing. A surface that derives its refusal from that one
 * nullable value states the terminal answer during the race. Seat-proven, on
 * 2026-09-18, on the Tasks import control:
 *
 *   @4048ms  disabled title="Select an organization before importing Google Tasks."
 *   +9571ms  GET /rest/v1/organizations?…            ← the memberships read
 *   @17395ms disabled title="Select an organization before importing Google Tasks."
 *   @20601ms disabled=null title=null                ← the org was always there
 *
 * Thirteen seconds of a factual lie, with a remedy the person did not need, in
 * a file the previous round had just touched — and every check green, because
 * the sentence itself was honest and the module did present it.
 *
 * THE RULE
 * --------
 * A module that SPELLS an organization refusal — one of the sentences below, or
 * `OrganizationRequiredNotice` — must also carry a THREE-STATE reading:
 *
 *   `useOrganizationRequired` / `organizationState`  — the hook, or
 *   `useOrganizationGatedControl`                    — the control gate, or
 *   `OrganizationContextNotice`                      — the state-driven notice, or
 *   `selectShouldPromptForOrganization` / `selectOrgBootstrapResolved`
 *                                                    — the underlying signal, or
 *   `awaitEffectiveOrganizationId` / `awaitOrganizationForRecordRead` /
 *   `waitForOrganizationAdmission` / `ensureOrganizationContext` / `ensureOrgId` /
 *   `whenOrgBootstrapResolved`                       — it WAITS for the answer
 *                                                      instead of refusing on a
 *                                                      race, or
 *   `isOrganizationRequiredError` / `presentOrganizationRefusal` /
 *   `withOrganizationRefusalShown` / `organizationRefusalMessage`
 *                                                    — the sentence is a REACTION
 *                                                      to the kernel's own throw,
 *                                                      which already waited,
 *
 * or be recorded debt in `scripts/org-three-states-census.json` (which only
 * shrinks, in both directions), or a reasoned permanent exception in
 * `scripts/org-three-states.allowlist.json`.
 *
 * A module that merely PASSES an organization id around trips nothing; only
 * spelling the refusal puts you under the rule, because only a spelled refusal
 * can be spelled too early.
 *
 * Run:  pnpm check:org-three-states
 *       pnpm check:org-three-states --self-test   (proves it can FAIL)
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(ROOT, "scripts", "org-three-states.allowlist.json");
/**
 * THE CENSUS — pre-existing debt, and it ONLY SHRINKS.
 *
 * The rule's first run turned up 113 modules that spell an organization refusal
 * from a nullable id, across settings, secrets, workflows, tasks, notes and the
 * admin surfaces. That is a real census, not guard noise, and it is far more
 * than one change can repair honestly — so the repo's standard shape applies
 * (CLAUDE.md: "every guard with a baseline now has one that ONLY SHRINKS"): a
 * listed module is recorded debt, a module NOT on the list is a hard failure,
 * and an entry that no longer violates is ALSO a failure — struck the moment it
 * is repaired, or the number stops meaning anything.
 *
 * The census is NOT the allowlist. The allowlist is a deliberate, reasoned,
 * permanent exception. A census line is a promise to come back.
 */
const CENSUS_PATH = join(ROOT, "scripts", "org-three-states-census.json");

const SCAN_DIRS = ["app", "features", "components", "providers", "hooks", "lib"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

/**
 * The sentences that SPELL the refusal. Deliberately narrow: each one is an
 * instruction to pick an organization, i.e. a claim that boot has settled with
 * none. "organization_context_required" and the kernel's own wire string are
 * NOT here — they are thrown by the transports, which is the right place to
 * fail closed, and `check-org-refusal-honesty` owns what a screen does with
 * them.
 */
const SPELLS_A_REFUSAL: readonly RegExp[] = [
  /\bSelect an organization\b/,
  /\bChoose an organization\b/,
  /\bChoose the organization\b/,
  /\bPick an organization\b/,
  /\bno organization is selected\b/i,
  /\bwithout an organization\b/i,
  /\bOrganizationRequiredNotice\b/,
];

/** Any one of these means the module can tell the three states apart. */
const THREE_STATE_SIGNALS = [
  "useOrganizationRequired",
  "organizationState",
  "useOrganizationGatedControl",
  "OrganizationContextNotice",
  "selectShouldPromptForOrganization",
  "selectOrgBootstrapResolved",
  "orgBootstrapResolved",
  "awaitEffectiveOrganizationId",
  "awaitOrganizationForRecordRead",
  "waitForOrganizationAdmission",
  "ensureOrganizationContext",
  "ensureOrgId",
  "whenOrgBootstrapResolved",
  "isOrgBootstrapResolved",
  // A sentence shown in REACTION to the kernel's own refusal is already after
  // the wait: `ensureOrgId` / `requireSelectedOrgId` join `orgBootstrapGate`
  // before they throw, so a module that recognises or re-words that throw cannot
  // be spelling the refusal early. These are the recognisers and the ONE
  // sentence builder (`lib/organizations/organizationRefusalToast.ts`).
  "isOrganizationRequiredError",
  "presentOrganizationRefusal",
  "withOrganizationRefusalShown",
  "organizationRefusalMessage",
  "organizationRefusalToast",
  "OrganizationContextError",
];

interface Allowlist {
  [file: string]: string;
}

function loadAllowlist(): Allowlist {
  if (!existsSync(ALLOWLIST_PATH)) return {};
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as Allowlist;
  for (const [file, reason] of Object.entries(parsed)) {
    if (typeof reason !== "string" || reason.trim().length < 10) {
      throw new Error(
        `Allowlist entry "${file}" needs a real reason, not "${reason}".`,
      );
    }
  }
  return parsed;
}

interface Census {
  reason: string;
  modules: string[];
}

function loadCensus(): Set<string> {
  if (!existsSync(CENSUS_PATH)) return new Set();
  const parsed = JSON.parse(readFileSync(CENSUS_PATH, "utf8")) as Census;
  return new Set(parsed.modules ?? []);
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

/**
 * Strip comments before matching. A doc comment QUOTING the defect — this
 * file's own header does it, and so do half the files it guards — is
 * documentation, not a refusal rendered at the wrong moment, and a guard that
 * reads prose as code teaches people to delete the prose.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

export function spellsARefusal(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return SPELLS_A_REFUSAL.some((pattern) => pattern.test(source));
}

export function readsThreeStates(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return THREE_STATE_SIGNALS.some((needle) => source.includes(needle));
}

export interface Violation {
  file: string;
  why: string;
}

export function scan(
  options: { allowlist?: Allowlist; census?: Set<string>; useCensus?: boolean } = {},
): Violation[] {
  const allowlist = options.allowlist ?? loadAllowlist();
  const useCensus = options.useCensus ?? true;
  const census = options.census ?? (useCensus ? loadCensus() : new Set<string>());
  const violations: Violation[] = [];
  const stillViolating = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const full of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, full);
      if (rel in allowlist) continue;
      let raw: string;
      try {
        raw = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (!spellsARefusal(raw)) continue;
      if (readsThreeStates(raw)) continue;
      stillViolating.add(rel);
      if (census.has(rel)) continue;
      violations.push({
        file: rel,
        why:
          "spells an organization refusal but cannot tell the three states apart — " +
          "it will show this sentence while boot is still resolving.",
      });
    }
  }
  // The ratchet's other direction: a census entry that is clean now must be
  // STRUCK, or the baseline silently stops meaning anything.
  for (const listed of census) {
    if (!stillViolating.has(listed)) {
      violations.push({
        file: listed,
        why:
          "no longer violates — strike it from scripts/org-three-states-census.json " +
          "(the baseline only shrinks).",
      });
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file));
}

const PLANTED = join(ROOT, "features", "organizations", "__self_test_planted__.tsx");

function selfTest(): number {
  let failed = 0;
  const check = (label: string, actual: boolean, expected: boolean) => {
    const ok = actual === expected;
    console.log(
      `[self-test] ${ok ? "ok  " : "FAIL"} ${label} = ${actual} (expected ${expected})`,
    );
    if (!ok) failed += 1;
  };

  const twoStates = `"use client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
export function Planted() {
  const organizationId = useAppSelector(selectOrganizationId);
  return <button disabled={!organizationId} title="Select an organization before importing Google Tasks." />;
}
`;
  const threeStates = twoStates.replace(
    'import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";',
    'import { useOrganizationGatedControl } from "@/features/organizations/useOrganizationGatedControl";',
  );
  const prose = `"use client";
// A doc comment that says "Select an organization before importing Google Tasks."
export function Planted() { return null; }
`;

  check("A. the two-state shape is recognised", spellsARefusal(twoStates) && !readsThreeStates(twoStates), true);
  check("B. the three-state shape is cleared  ", readsThreeStates(threeStates), true);
  check("C. prose alone is NOT a violation    ", spellsARefusal(prose), false);

  // The end-to-end leg: the real scan, over the real tree, with the shapes
  // planted in it.
  let plantedFlagged = false;
  let repairedFlagged = true;
  try {
    writeFileSync(PLANTED, twoStates, "utf8");
    plantedFlagged = scan({ useCensus: false }).some((v) =>
      v.file.includes("__self_test_planted__"),
    );
    writeFileSync(PLANTED, threeStates, "utf8");
    repairedFlagged = scan({ useCensus: false }).some((v) =>
      v.file.includes("__self_test_planted__"),
    );
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("D. planted two-state module flagged  ", plantedFlagged, true);
  check("E. repaired module cleared           ", repairedFlagged, false);

  // The allowlist forgives, and only with a reason.
  let allowlisted = true;
  try {
    writeFileSync(PLANTED, twoStates, "utf8");
    allowlisted = scan({
      useCensus: false,
      allowlist: { [relative(ROOT, PLANTED)]: "planted by the self-test, with a reason" },
    }).some((v) => v.file.includes("__self_test_planted__"));
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("F. an allowlisted module is forgiven ", allowlisted, false);

  // The RATCHET, both directions.
  let newOneFlagged = false;
  let staleFlagged = false;
  try {
    writeFileSync(PLANTED, twoStates, "utf8");
    newOneFlagged = scan().some((v) => v.file.includes("__self_test_planted__"));
    staleFlagged = scan({
      census: new Set(["features/organizations/useOrganizationRequired.ts"]),
    }).some(
      (v) =>
        v.file === "features/organizations/useOrganizationRequired.ts" &&
        v.why.includes("no longer violates"),
    );
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("G. a NEW violation is not forgiven    ", newOneFlagged, true);
  check("H. a STALE census entry is a failure  ", staleFlagged, true);

  if (failed > 0) {
    console.error(`SELF-TEST FAILED: ${failed} expectation(s) did not hold.`);
    return 1;
  }
  console.log("[self-test] PASS — the rule fails on the defect and passes on the fix.");
  return 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const violations = scan();
  if (violations.length === 0) {
    console.log(
      "check-org-three-states: OK — every spelled organization refusal is derived from the three states.",
    );
    return 0;
  }
  console.error(
    `check-org-three-states: ${violations.length} module(s) spell an organization refusal from a nullable id:\n`,
  );
  for (const violation of violations) {
    console.error(`  ${violation.file}\n      ${violation.why}`);
  }
  console.error(
    `\nRead the three states through useOrganizationRequired (body),\n` +
      `useOrganizationGatedControl (control) or OrganizationContextNotice (either),\n` +
      `or WAIT for the answer with awaitEffectiveOrganizationId /\n` +
      `awaitOrganizationForRecordRead instead of refusing on a race.\n` +
      `A genuine exception goes in scripts/org-three-states.allowlist.json with a reason;\n` +
      `pre-existing debt is the census at scripts/org-three-states-census.json, which only shrinks.`,
  );
  return 1;
}

try {
  exitAfterDrain(main());
} catch (error) {
  console.error("check-org-three-states: unexpected error", error);
  exitAfterDrain(2);
}
