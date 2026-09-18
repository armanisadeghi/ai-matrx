/**
 * check-org-refusal-honesty — the RENDER-side twin of check-org-header-lanes.
 *
 * THE CLASS this guards
 * ---------------------
 * `check-org-header-lanes` proves a transport ASKS for an organization.
 * Nothing proved what the SCREEN does when the answer is "none selected".
 * The transports fail closed before networking —
 * `requireOrganizationContext` / `requireSelectedOrgId` / `ensureOrgId` throw
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
 * 🚨 WHY THE RULE WAS INVERTED (2026-09-17). The first cut only fired on a
 * module that ALREADY presented a failure (`setError` / `toast.error` / …), so
 * a module that showed the person NOTHING was exempt by construction — the
 * worst case was the one the guard could not see. It proved itself on
 * `HtmlPreviewBridge`: `registerArtifactThunk` started throwing the refusal,
 * the bridge caught it into `console.error` and opened the page anyway, so the
 * page appeared, looked saved, and the `chat.artifact` row was never written.
 * A silent misfile became a silent LOSS, and every check stayed green. The
 * rule now runs the other way: a module that CALLS a throwing resolver owes
 * the person an honest refusal, and silence is the violation.
 *
 * THE RULE
 * --------
 * A module that resolves an organization itself — `requireSelectedOrgId(`,
 * `requireOrganizationContext(` or `ensureOrgId(` — MUST do one of:
 *
 *   1. present the refusal ITSELF, by carrying one of the honest signals:
 *        - `isOrganizationRequiredError`  — it recognises the refusal, or
 *        - `OrganizationRequiredNotice`   — it renders the honest state, or
 *        - `useOrganizationRequired`      — it guards before the call and
 *                                           derives the refusal once boot has
 *                                           settled, or
 *        - `ensureOrganizationContext`    — it ASKS and continues (the right
 *                                           shape for a blocked action rather
 *                                           than a load), or
 *        - `presentOrganizationRefusal` / `withOrganizationRefusalShown`
 *                                         — it TELLS the person the act was
 *                                           refused, with the remedy, from
 *                                           action code that has nowhere to
 *                                           render (lib/organizations/
 *                                           organizationRefusalToast.ts);
 *   2. be a slice / service / thunk whose CALLER presents it — the guard
 *      follows the module's importers and is satisfied by any direct caller
 *      carrying an honest signal;
 *   3. name that presenter explicitly when the importer graph cannot show it
 *      (a lazily-imported module, a saga, a worker): a
 *      `org-refusal-presented-by: <repo-relative path>` comment, whose target
 *      the guard OPENS and requires to carry an honest signal — a marker that
 *      points at a file which presents nothing is itself a violation;
 *   4. or go in scripts/org-refusal-honesty.allowlist.json WITH A REASON.
 *
 * Run:  pnpm check:org-refusal-honesty
 *       pnpm check:org-refusal-honesty --self-test   (proves it can FAIL)
 * Exit 1 on any unallowlisted violation; exit 2 on unexpected errors.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");
const ALLOWLIST_PATH = join(ROOT, "scripts", "org-refusal-honesty.allowlist.json");
/**
 * THE CENSUS — pre-existing debt, and it ONLY SHRINKS.
 *
 * Inverting the rule (2026-09-17) turned up 84 modules that resolve an
 * organization and leave the person with nothing. That is a real census, not
 * guard noise, and it is far more than one change can repair honestly. So the
 * repo's standard shape applies (CLAUDE.md: "every guard with a baseline now
 * has one that ONLY SHRINKS"): the listed modules are recorded debt, a module
 * NOT on the list is a hard failure, and an entry that no longer violates is
 * ALSO a failure — it must be struck the moment it is repaired, or the number
 * stops meaning anything.
 *
 * The census is NOT the allowlist. The allowlist is a deliberate, reasoned,
 * permanent exception. A census line is a promise to come back.
 */
const CENSUS_PATH = join(ROOT, "scripts", "org-refusal-honesty-census.json");

const SCAN_DIRS = ["app", "features", "components", "providers", "hooks", "lib"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

/**
 * Calls that resolve an organization and THROW the fail-closed refusal.
 * `ensureOrgId` joined this list on 2026-09-17, when it lost its silent
 * personal-organization fallback and started throwing like the other two —
 * ~90 call sites changed behaviour in one commit and nothing watched the
 * screens. The lookbehind keeps a declaration (`function ensureOrgId(`) from
 * flagging its own module; `ensureOrgIdServer(` is deliberately NOT matched
 * (it resolves the SESSION's personal org server-side and never refuses).
 */
const RESOLVES_ORGANIZATION: readonly RegExp[] = [
  /(?<!function\s)\brequireSelectedOrgId\s*\(/,
  /(?<!function\s)\brequireOrganizationContext\s*\(/,
  /(?<!function\s)\bensureOrgId\s*\(/,
];

/** Any one of these means the refusal has an honest home in this file. */
const HONEST_SIGNALS = [
  "isOrganizationRequiredError",
  "presentOrganizationRefusal",
  "withOrganizationRefusalShown",
  "OrganizationRequiredNotice",
  "useOrganizationRequired",
  "ensureOrganizationContext",
];

/**
 * `org-refusal-presented-by: <repo-relative path>` — the escape hatch for a
 * module whose presenter the import graph cannot show. The path is OPENED and
 * must itself carry an honest signal, so the marker can never be a sticker.
 */
const PRESENTED_BY = /org-refusal-presented-by:\s*([^\s*]+)/;

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
 * Strip comments before matching CODE. The first cut of this rule flagged
 * three files whose only "evidence" was PROSE — a doc comment explaining
 * `requireSelectedOrgId`, an `onError: (err) => setError(...)` usage example.
 * A guard that reads documentation as code teaches people to delete the
 * documentation, so it reads only what runs. (The `org-refusal-presented-by`
 * marker is read from the RAW source, because it lives in a comment by
 * design.)
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Does this module resolve an organization itself, i.e. own the refusal? */
export function resolvesOrganization(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return RESOLVES_ORGANIZATION.some((pattern) => pattern.test(source));
}

/** Does this module present the refusal to the person? */
export function presentsRefusal(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return HONEST_SIGNALS.some((needle) => source.includes(needle));
}

/** The presenter this module names, or null. Read from the raw source. */
export function presentedByMarker(rawSource: string): string | null {
  const match = PRESENTED_BY.exec(rawSource);
  return match ? match[1] : null;
}

// ── The import graph: "who calls this?" ──────────────────────────────────────

const IMPORT_SPEC = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** Resolve one import specifier to a repo-relative file, or null. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../"))
    base = resolve(fromFile, "..", spec);
  else return null;
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(ROOT, candidate);
    }
  }
  return null;
}

interface ScannedFile {
  rel: string;
  raw: string;
  resolves: boolean;
  presents: boolean;
}

/** rel path → the rel paths that import it. */
function buildImporterIndex(files: ScannedFile[]): Map<string, string[]> {
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const importers = new Map<string, string[]>();
  for (const file of files) {
    const code = stripComments(file.raw);
    const seen = new Set<string>();
    IMPORT_SPEC.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_SPEC.exec(code)) !== null) {
      const target = resolveSpecifier(join(ROOT, file.rel), match[1]);
      if (!target || seen.has(target) || !byRel.has(target)) continue;
      seen.add(target);
      const list = importers.get(target);
      if (list) list.push(file.rel);
      else importers.set(target, [file.rel]);
    }
  }
  return importers;
}

/**
 * Walk UP the import graph looking for a module that presents the refusal.
 *
 * Depth matters and the shallow answer is wrong. The repo's ordinary shape for
 * an org-scoped write is service → hook → component, so "does a DIRECT caller
 * present it" fails ~84 modules whose refusal does reach a screen one hop
 * further up. The walk is therefore transitive, bounded by
 * `PRESENTER_SEARCH_DEPTH`, with cycle protection. Bounding it is what keeps
 * the rule from degenerating: at unbounded depth every leaf module in the repo
 * eventually reaches SOME component that recognises the refusal, and the guard
 * would pass everything.
 */
const PRESENTER_SEARCH_DEPTH = Number(
  process.env.ORG_REFUSAL_PRESENTER_DEPTH ?? 2,
);

function findPresentingCaller(
  rel: string,
  importers: Map<string, string[]>,
  byRel: Map<string, ScannedFile>,
): string | null {
  const seen = new Set<string>([rel]);
  let frontier = importers.get(rel) ?? [];
  for (let depth = 0; depth < PRESENTER_SEARCH_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const caller of frontier) {
      if (seen.has(caller)) continue;
      seen.add(caller);
      if (byRel.get(caller)?.presents) return caller;
      next.push(...(importers.get(caller) ?? []));
    }
    frontier = next;
  }
  return null;
}

interface Violation {
  file: string;
  why: string;
}

function scan(
  options: { useCensus?: boolean; census?: Set<string> } = {},
): Violation[] {
  const allowlist = loadAllowlist();
  const census =
    options.census ??
    (options.useCensus === false ? new Set<string>() : loadCensus());
  const files: ScannedFile[] = [];
  for (const dir of SCAN_DIRS) {
    for (const full of walk(join(ROOT, dir))) {
      const raw = readFileSync(full, "utf8");
      files.push({
        rel: relative(ROOT, full),
        raw,
        resolves: resolvesOrganization(raw),
        presents: presentsRefusal(raw),
      });
    }
  }
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const importers = buildImporterIndex(files);

  const violations: Violation[] = [];
  const hard: Violation[] = [];
  const stillOnCensus = new Set<string>();

  for (const file of files) {
    if (!file.resolves) continue;
    if (file.rel in allowlist) continue;
    if (file.presents) continue;

    // 3. an explicitly named presenter — opened and required to present. A
    //    broken marker is never census-forgiven: somebody wrote it by hand.
    const marker = presentedByMarker(file.raw);
    if (marker) {
      const target = byRel.get(marker);
      if (!target) {
        hard.push({
          file: file.rel,
          why: `names "org-refusal-presented-by: ${marker}", which is not a file this scan can see`,
        });
      } else if (!target.presents) {
        hard.push({
          file: file.rel,
          why: `names "org-refusal-presented-by: ${marker}", but that file presents nothing either`,
        });
      }
      continue;
    }

    // 2. a caller (or its caller) presents it.
    if (findPresentingCaller(file.rel, importers, byRel)) continue;

    if (census.has(file.rel)) {
      stillOnCensus.add(file.rel);
      continue;
    }
    const callers = importers.get(file.rel) ?? [];
    violations.push({
      file: file.rel,
      why:
        callers.length === 0
          ? "resolves an organization, presents nothing, and nothing in the scan imports it"
          : `resolves an organization and presents nothing; none of its ${callers.length} caller(s) present it either`,
    });
  }

  // A census entry that no longer violates must be struck, or the number stops
  // meaning anything — the ratchet only turns one way.
  for (const entry of [...census].sort()) {
    if (stillOnCensus.has(entry)) continue;
    violations.push({
      file: entry,
      why: `is on the census but no longer violates — strike it from ${relative(ROOT, CENSUS_PATH)} (the ratchet only turns one way)`,
    });
  }

  violations.push(...hard);
  return violations.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Prove the check can fail. A guard nobody has watched fail is not a guard.
 * Three plants, because the rule has three ways to be satisfied:
 *
 *   A. the 2026-09-12 defect — resolve an organization, render the thrown
 *      message, handle nothing;
 *   B. the 2026-09-17 inversion — resolve an organization and show the person
 *      NOTHING (the HtmlPreviewBridge shape, which the old rule let through
 *      BECAUSE it presented no failure);
 *   C. a marker pointing at a file that presents nothing — a sticker.
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
  const silent = `
    import { ensureOrgId } from "@/lib/organizations/personalOrg";
    export async function save(row: Row) {
      try { await write({ ...row, organization_id: await ensureOrgId(null) }); }
      catch (e) { console.error("[save]", e); }
      open(row.id);
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

  const checks: Array<[string, boolean, boolean]> = [
    // label, actual, expected
    ["A. rendered refusal, handled nowhere  -> resolves", resolvesOrganization(broken), true],
    ["A. rendered refusal, handled nowhere  -> presents", presentsRefusal(broken), false],
    ["B. silent swallow (ensureOrgId)       -> resolves", resolvesOrganization(silent), true],
    ["B. silent swallow (ensureOrgId)       -> presents", presentsRefusal(silent), false],
    ["C. marker read from a comment         -> found", presentedByMarker("// org-refusal-presented-by: features/x/X.tsx") === "features/x/X.tsx", true],
    ["D. repaired module                    -> presents", presentsRefusal(fixed), true],
  ];
  let failed = 0;
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`[self-test] ${ok ? "ok  " : "FAIL"} ${label} = ${actual} (expected ${expected})`);
  }

  // The end-to-end leg: the real scan, with the planted shapes written into
  // the tree, must name them and must clear them once repaired.
  const planted = join(ROOT, "lib", "organizations", "__self_test_planted__.ts");
  let plantedFlagged = false;
  let repairedFlagged = true;
  try {
    writeFileSync(planted, silent, "utf8");
    plantedFlagged = scan({ useCensus: false }).some((v) => v.file.includes("__self_test_planted__"));
    writeFileSync(
      planted,
      silent.replace(
        'import { ensureOrgId }',
        'import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";\nimport { ensureOrgId }',
      ),
      "utf8",
    );
    repairedFlagged = scan({ useCensus: false }).some((v) => v.file.includes("__self_test_planted__"));
  } finally {
    try { unlinkSync(planted); } catch { /* already gone */ }
  }
  console.log(`[self-test] ${plantedFlagged ? "ok  " : "FAIL"} E. planted silent module flagged by the real scan = ${plantedFlagged} (expected true)`);
  console.log(`[self-test] ${!repairedFlagged ? "ok  " : "FAIL"} F. repaired module cleared by the real scan  = ${repairedFlagged} (expected false)`);
  if (!plantedFlagged) failed += 1;
  if (repairedFlagged) failed += 1;

  // The RATCHET, both directions. A new violation is not forgiven by the
  // census, and a census entry that no longer violates is itself a failure.
  let newOneFlagged = false;
  let staleFlagged = false;
  try {
    writeFileSync(planted, silent, "utf8");
    newOneFlagged = scan().some((v) => v.file.includes("__self_test_planted__"));
    const relPlanted = relative(ROOT, planted);
    staleFlagged = scan({
      census: new Set([relPlanted, "lib/organizations/organizationRequiredError.ts"]),
    }).some(
      (v) =>
        v.file === "lib/organizations/organizationRequiredError.ts" &&
        v.why.includes("no longer violates"),
    );
  } finally {
    try { unlinkSync(planted); } catch { /* already gone */ }
  }
  console.log(`[self-test] ${newOneFlagged ? "ok  " : "FAIL"} G. a NEW violation is not forgiven by the census = ${newOneFlagged} (expected true)`);
  console.log(`[self-test] ${staleFlagged ? "ok  " : "FAIL"} H. a STALE census entry is itself a failure     = ${staleFlagged} (expected true)`);
  if (!newOneFlagged) failed += 1;
  if (!staleFlagged) failed += 1;

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
    console.log("check-org-refusal-honesty: OK — every organization refusal has an honest screen.");
    return 0;
  }
  console.error(
    `check-org-refusal-honesty: ${violations.length} module(s) resolve an organization and leave the person with nothing when the answer is "none selected":\n`,
  );
  for (const violation of violations) {
    console.error(`  ${violation.file}\n      ${violation.why}`);
  }
  console.error(
    `\nEach must either recognise it (isOrganizationRequiredError + OrganizationRequiredNotice),\n` +
      `guard before the call (useOrganizationRequired), ask and continue (ensureOrganizationContext),\n` +
      `be imported by a caller that does, or name its presenter with an\n` +
      `"org-refusal-presented-by: <path>" comment the guard can open.\n` +
      `A genuine exception goes in scripts/org-refusal-honesty.allowlist.json with a reason.`,
  );
  return 1;
}

try {
  exitAfterDrain(main());
} catch (error) {
  console.error("check-org-refusal-honesty: unexpected error", error);
  exitAfterDrain(2);
}
