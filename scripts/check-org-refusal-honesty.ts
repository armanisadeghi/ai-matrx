/**
 * check-org-refusal-honesty — the RENDER-side twin of check-org-header-lanes.
 *
 * THE CLASS this guards
 * ---------------------
 * `check-org-header-lanes` proves a transport ASKS for an organization.
 * Nothing proved what the SCREEN does when the answer is "none selected".
 * The transports fail closed before networking —
 * `requireOrganizationContext` / `requireSelectedOrgId` throw
 * `OrganizationContextError("organization_context_required", …)` — and on
 * 2026-09-12 a sweep found that refusal reaching users as, variously: the raw
 * sentence "Select an organization before sending this request." beside a
 * Retry button that could only fail again; "Google connection needs
 * attention" (nothing was wrong with Google); "The proof-run API did not
 * answer" (it answered fine, we never called it); "Failed to save template"
 * (cause discarded entirely); a permanent loading skeleton; and — worst,
 * because it is calm — "No context measurements yet. Fire a turn to
 * populate." Six shapes of one class: a screen that is dead or lying, which
 * law 4 forbids.
 *
 * THE RULE
 * --------
 * A module that resolves an organization ITSELF (calls `requireSelectedOrgId`
 * or `requireOrganizationContext`) or consumes a registered org-requiring
 * transport, AND presents a failure to a human (`setError` / `setLoadError` /
 * `setFailure` / `toast.error` / a rendered `.message`), MUST carry one of the
 * honest-refusal signals:
 *
 *   - `isOrganizationRequiredError`  — it recognises the refusal, or
 *   - `OrganizationRequiredNotice`   — it renders the honest state, or
 *   - `useOrganizationRequired`      — it guards before the call and derives
 *                                      the refusal once boot has settled, or
 *   - `ensureOrganizationContext`    — it ASKS and continues (the right shape
 *                                      for a blocked action rather than a load).
 *
 * A module that legitimately cannot do any of these goes in
 * scripts/org-refusal-honesty.allowlist.json WITH A REASON — never silently.
 *
 * Run:  pnpm check:org-refusal-honesty
 *       pnpm check:org-refusal-honesty --self-test   (proves it can FAIL)
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(ROOT, "scripts", "org-refusal-honesty.allowlist.json");

const SCAN_DIRS = ["app", "features", "components", "providers", "hooks", "lib"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

/** Calls that resolve an organization and throw the fail-closed refusal. */
const RESOLVES_ORGANIZATION = [
  "requireSelectedOrgId(",
  "requireOrganizationContext(",
];

/** Presenting a failure to a human. */
const PRESENTS_FAILURE = [
  "setError(",
  "setLoadError(",
  "setFailure(",
  "toast.error(",
  "setDbLoadError(",
];

/** Any one of these means the refusal has an honest home in this file. */
const HONEST_SIGNALS = [
  "isOrganizationRequiredError",
  "OrganizationRequiredNotice",
  "useOrganizationRequired",
  "ensureOrganizationContext",
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
 * Strip comments before matching. The first cut of this rule flagged three
 * files whose only "evidence" was PROSE — a doc comment explaining
 * `requireSelectedOrgId`, an `onError: (err) => setError(...)` usage example.
 * A guard that reads documentation as code teaches people to delete the
 * documentation, so it reads only what runs.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function hasAny(source: string, needles: readonly string[]): boolean {
  return needles.some((needle) => source.includes(needle));
}

export function violates(rawSource: string): boolean {
  const source = stripComments(rawSource);
  if (!hasAny(source, RESOLVES_ORGANIZATION)) return false;
  if (!hasAny(source, PRESENTS_FAILURE)) return false;
  return !hasAny(source, HONEST_SIGNALS);
}

function scan(): string[] {
  const allowlist = loadAllowlist();
  const violations: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      if (rel in allowlist) continue;
      if (violates(readFileSync(file, "utf8"))) violations.push(rel);
    }
  }
  return violations.sort();
}

/**
 * Prove the check can fail. A guard nobody has watched fail is not a guard, so
 * this plants the exact shape of the 2026-09-12 defect — resolve an
 * organization, render the thrown message, handle nothing — and asserts the
 * rule flags it, then asserts the fixed version passes.
 */
function selfTest(): number {
  const broken = `
    import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
    export function Broken() {
      const [error, setError] = useState<string | null>(null);
      try { load(requireSelectedOrgId()); }
      catch (e) { setError(e instanceof Error ? e.message : "failed"); }
      return <p>{error}</p>;
    }
  `;
  const fixed = `
    import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
    import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
    import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
    export function Fixed() {
      const [error, setError] = useState<string | null>(null);
      const [orgRequired, setOrgRequired] = useState(false);
      try { load(requireSelectedOrgId()); }
      catch (e) {
        if (isOrganizationRequiredError(e)) setOrgRequired(true);
        else setError(e instanceof Error ? e.message : "failed");
      }
      if (orgRequired) return <OrganizationRequiredNotice />;
      return <p>{error}</p>;
    }
  `;
  const brokenFlagged = violates(broken);
  const fixedFlagged = violates(fixed);
  console.log(`[self-test] planted violation flagged : ${brokenFlagged}`);
  console.log(`[self-test] repaired version flagged  : ${fixedFlagged}`);
  if (!brokenFlagged) {
    console.error("SELF-TEST FAILED: the rule did not flag a known violation.");
    return 1;
  }
  if (fixedFlagged) {
    console.error("SELF-TEST FAILED: the rule flagged a compliant file.");
    return 1;
  }
  console.log("[self-test] PASS — the rule fails on the defect and passes on the fix.");
  return 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const violations = scan();
  if (violations.length === 0) {
    console.log("check-org-refusal-honesty: OK — every organization refusal has an honest screen.");
    return 0;
  }
  console.error(
    `check-org-refusal-honesty: ${violations.length} file(s) resolve an organization and render the failure, but handle the "no organization selected" refusal nowhere:\n`,
  );
  for (const file of violations) console.error(`  ${file}`);
  console.error(
    `\nEach must either recognise it (isOrganizationRequiredError + OrganizationRequiredNotice),\n` +
      `guard before the call (useOrganizationRequired), or ask and continue (ensureOrganizationContext).\n` +
      `A genuine exception goes in scripts/org-refusal-honesty.allowlist.json with a reason.`,
  );
  return 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error("check-org-refusal-honesty: unexpected error", error);
  process.exit(2);
}
