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
 * THE SECOND RULE — THE FOURTH STATE IS NOT THE REFUSAL (R37, 2026-09-18)
 * ----------------------------------------------------------------------
 * There are FOUR states, not three: the read can FAIL. On a cold load whose
 * Supabase calls failed, `current_personal_org_id()` answered `TypeError:
 * Failed to fetch` and the import control went straight from "Checking which
 * organization you are working in…" to "Select an organization before
 * importing Google Tasks.", disabled, and stayed there for 24 seconds — to a
 * person who is a member of THIRTEEN organizations. An abort, a page that
 * never goes idle, a null resolve and a failed RPC all landed in the terminal
 * `required` state, because that state was the only terminal one there was.
 *
 * So: a module that ENUMERATES the states — it names `"resolving"` AND
 * `"required"` as literals against `organizationState` — must name
 * `"unavailable"` too. Collapsing the fourth into the refusal is the defect;
 * handling it (a switch with four arms, an `if (state === "unavailable")`) is
 * the fix. A module that only tests `!== "ready"` enumerates nothing and is
 * untouched by this rule, because non-ready already covers the fourth state.
 *
 * THE THIRD RULE — THE POSTURE CARRIES ITS REMEDY (V-24 NEW-3, 2026-09-18)
 * -----------------------------------------------------------------------
 * The fourth state's control sentence ends "Press to try again." It used to end
 * "Try again." on a control that could not be pressed, and on `/tasks` there
 * was no organization Try again ANYWHERE on the page: the only one on screen
 * belonged to the task list, and pressing it left the import control saying
 * "Try again." for the whole 20s that was then sampled. A sentence that names a
 * remedy the screen does not offer is law 4 in a smaller frame.
 *
 * So: a module that can RENDER the fourth state's control posture — it calls
 * `useOrganizationGatedControl`, names `ORGANIZATION_UNAVAILABLE_TITLE_CONTROL`,
 * or spells that sentence — must also WIRE the remedy: `gate.press(...)` (the
 * gate's own onClick, which re-runs the read in `unavailable`), a `retry()`
 * call, or an `onRetry` it hands down. Reading `disabled` and `title` beside a
 * hand-written `onClick` is exactly the defect and is refused by name. Neither
 * the census nor rule 2's shape forgives this one; a genuine exception is the
 * allowlist, with a reason.
 *
 * THE FOURTH RULE — THE LEGACY PAIR IS NOT A READING OF FOUR STATES
 * -----------------------------------------------------------------
 * `useOrganizationRequired` still exposes `organizationRequired` and
 * `resolving` for the surfaces written before the discriminant existed, and
 * `resolving` is documented to stay TRUE through `unavailable` on purpose, so
 * an old reader keeps the checking posture instead of falling through to a
 * refusal. That is the right default and the wrong ANSWER: a surface whose only
 * reading is that pair can never leave the waiting posture when the
 * organization read fails, because `organizationRequired` is false (the nudge
 * is a claim about memberships nobody read) and `resolving` is true. It shows a
 * skeleton, a spinner or a "loading" state for as long as the tab stays open —
 * law 4's dead screen, arrived at from the opposite direction to rule 2.
 *
 * Seat-proven in five surfaces at once (2026-09-19): `ModelContextPanel` sat on
 * "Reading this conversation's context…", `EncoreRunPage`'s bench panel on
 * `{ status: "loading" }`, `useWaitingRuns` and `useRunsList` on their list
 * skeletons, `useAgenda` on the agenda skeleton, and `EduNoteNew` on "Creating
 * your note…" while no note was being created.
 *
 * So: a module that reads `organizationRequired` or `resolving` OFF THE GATE
 * must also read `organizationState`. A module that reads only `organizationId`
 * / `canLoad` is a call guard, not a screen, and is untouched. Neither the
 * census nor the allowlist is the normal answer here — the fix is one word.
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

/**
 * RULE 3 — the module can put the FOURTH STATE'S CONTROL POSTURE on screen.
 * Any one of these and it owns the sentence's remedy too.
 */
const RENDERS_THE_FOURTH_STATE_CONTROL: readonly RegExp[] = [
  /\buseOrganizationGatedControl\s*\(/,
  /\bORGANIZATION_UNAVAILABLE_TITLE_CONTROL\b/,
  /We could not check which organization you are working in/,
];

/**
 * …and any one of THESE is the remedy actually wired to a press. `press(` is
 * the gate's own handler; `retry(` is the same re-run called by hand; `onRetry`
 * is it handed to a child that presses it.
 */
const WIRES_THE_REMEDY: readonly RegExp[] = [
  /\.press\s*\(/,
  /(^|[^.\w$])press\s*\(/m,
  /\.retry\s*\(/,
  /(^|[^.\w$])retry\s*\(/m,
  /\bonRetry\b/,
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

/**
 * Does this module ENUMERATE the organization states? It does when it reads the
 * discriminant AND spells at least the two terminal-looking arms as literals —
 * the shape of a switch or a ternary chain over `organizationState`. A single
 * `!== "ready"` test is not an enumeration and never trips the rule.
 */
export function enumeratesStates(rawSource: string): boolean {
  const source = stripComments(rawSource);
  if (!/\bOrganizationState\b|\borganizationState\b/.test(source)) return false;
  return /["']resolving["']/.test(source) && /["']required["']/.test(source);
}

/** Can this module put the fourth state's CONTROL posture on screen? */
export function rendersTheFourthStateControl(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return RENDERS_THE_FOURTH_STATE_CONTROL.some((pattern) => pattern.test(source));
}

/** Does it wire a press that actually re-runs the organization read? */
export function wiresTheRemedy(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return WIRES_THE_REMEDY.some((pattern) => pattern.test(source));
}

/**
 * RULE 4 — does this module read the gate's LEGACY BOOLEAN PAIR? Destructuring
 * `organizationRequired` or `resolving` from a `useOrganizationRequired()` call
 * is the shape; a local `const [resolving, setResolving] = useState()` is not,
 * which is why the match is anchored to the call's own destructuring.
 */
const GATE_CALL =
  /(?:const|let)\s*\{([^}]*)\}\s*=\s*useOrganizationRequired\s*\(/g;

export function readsTheLegacyPairOnly(rawSource: string): boolean {
  const source = stripComments(rawSource);
  GATE_CALL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GATE_CALL.exec(source)) !== null) {
    const destructured = match[1];
    const legacy = /\borganizationRequired\b|\bresolving\b/.test(destructured);
    const discriminant = /\borganizationState\b/.test(destructured);
    if (legacy && !discriminant) return true;
  }
  return false;
}

/** Does it name the FOURTH state? */
export function handlesUnavailable(rawSource: string): boolean {
  return /["']unavailable["']/.test(stripComments(rawSource));
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
      // RULE 2 first: an exhaustive-looking reading that forgets the fourth
      // state is a hard failure, never census debt — the census is the
      // pre-existing two-state population, and nothing in it enumerates.
      if (enumeratesStates(raw) && !handlesUnavailable(raw)) {
        violations.push({
          file: rel,
          why:
            'enumerates the organization states ("resolving" / "required") but never names ' +
            '"unavailable" — a read that FAILED is collapsed into the refusal, so this ' +
            "surface tells a person to select an organization nobody ever looked for. " +
            "Handle the fourth state (R37).",
        });
        continue;
      }
      // RULE 3: the posture carries its remedy. A module that can render the
      // fourth state's control sentence — which ends "Press to try again." —
      // and wires no press that tries again is the sentence naming a button
      // that is not there (V-24 NEW-3). Never census debt: the sentence itself
      // is new, so there is no pre-existing population.
      if (rendersTheFourthStateControl(raw) && !wiresTheRemedy(raw)) {
        violations.push({
          file: rel,
          why:
            "can render the fourth state's control posture (\"We could not check which " +
            'organization you are working in. Press to try again.") but wires no press that ' +
            "re-runs the read — the sentence names a remedy this screen does not offer. " +
            "Render the gate's own handler: onClick={gate.press((organizationId) => …)}.",
        });
        continue;
      }
      // RULE 4: the legacy pair cannot leave the waiting posture when the
      // organization read FAILS — `organizationRequired` is false and
      // `resolving` is true by design, so the surface shows its skeleton
      // forever. Never census debt: the discriminant post-dates the census, and
      // the fix is reading it.
      if (readsTheLegacyPairOnly(raw)) {
        violations.push({
          file: rel,
          why:
            "reads useOrganizationRequired's LEGACY BOOLEANS (organizationRequired / " +
            "resolving) without organizationState — under a FAILED organization read " +
            "both point at \"keep waiting\", so this surface holds its skeleton, spinner " +
            "or loading state forever. Read organizationState and render the four " +
            "states (R37).",
        });
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

  // RULE 2 — the fourth state. A surface that switches on the discriminant and
  // stops at three arms collapses a FAILED read into the refusal.
  const collapsed = `"use client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
export function Planted() {
  const { organizationState } = useOrganizationRequired();
  if (organizationState === "resolving") return <Spinner />;
  if (organizationState === "required") return <Refusal />;
  return <Body />;
}
`;
  const exhaustive = collapsed.replace(
    'if (organizationState === "required") return <Refusal />;',
    'if (organizationState === "unavailable") return <CouldNotCheck />;\n  if (organizationState === "required") return <Refusal />;',
  );
  const nonReadyOnly = `"use client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
export function Planted() {
  const { organizationState } = useOrganizationRequired();
  if (organizationState !== "ready") return <OrganizationContextNotice state={organizationState} />;
  return <Body />;
}
`;
  check("I. a collapsed fourth state is seen   ", enumeratesStates(collapsed) && !handlesUnavailable(collapsed), true);
  check("J. an exhaustive reading is cleared   ", enumeratesStates(exhaustive) && handlesUnavailable(exhaustive), true);
  check("K. a bare !== \"ready\" test is untouched", enumeratesStates(nonReadyOnly), false);

  let collapsedFlagged = false;
  let exhaustiveFlagged = true;
  let collapsedForgiven = true;
  try {
    writeFileSync(PLANTED, collapsed, "utf8");
    collapsedFlagged = scan({ useCensus: false }).some(
      (v) => v.file.includes("__self_test_planted__") && v.why.includes("unavailable"),
    );
    // The census must NOT forgive rule 2 — it is a new rule with no debt.
    collapsedForgiven = !scan({
      census: new Set([relative(ROOT, PLANTED)]),
    }).some((v) => v.file.includes("__self_test_planted__"));
    writeFileSync(PLANTED, exhaustive, "utf8");
    exhaustiveFlagged = scan({ useCensus: false }).some((v) =>
      v.file.includes("__self_test_planted__"),
    );
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("L. planted collapsed module flagged   ", collapsedFlagged, true);
  check("M. exhaustive module cleared          ", exhaustiveFlagged, false);
  check("N. the census does not forgive rule 2 ", collapsedForgiven, false);

  // RULE 3 — the posture carries its remedy. A control that reads `disabled`
  // and `title` from the gate and writes its own onClick renders "Press to try
  // again." beside nothing that tries again (V-24 NEW-3).
  const noRemedy = `"use client";
import { useOrganizationGatedControl } from "@/features/organizations/useOrganizationGatedControl";
export function Planted() {
  const gate = useOrganizationGatedControl("importing Google Tasks");
  return <button disabled={gate.disabled} title={gate.title} onClick={() => open(gate.organizationId)} />;
}
`;
  const withRemedy = noRemedy.replace(
    "onClick={() => open(gate.organizationId)}",
    "onClick={gate.press((organizationId) => open(organizationId))}",
  );
  check("O. a posture with no remedy is seen    ", rendersTheFourthStateControl(noRemedy) && !wiresTheRemedy(noRemedy), true);
  check("P. the wired press is cleared          ", wiresTheRemedy(withRemedy), true);

  let noRemedyFlagged = false;
  let withRemedyFlagged = true;
  let noRemedyForgiven = true;
  try {
    writeFileSync(PLANTED, noRemedy, "utf8");
    noRemedyFlagged = scan({ useCensus: false }).some(
      (v) => v.file.includes("__self_test_planted__") && v.why.includes("no press"),
    );
    // The census is the two-state population; it must not forgive rule 3.
    noRemedyForgiven = !scan({
      census: new Set([relative(ROOT, PLANTED)]),
    }).some((v) => v.file.includes("__self_test_planted__"));
    writeFileSync(PLANTED, withRemedy, "utf8");
    withRemedyFlagged = scan({ useCensus: false }).some((v) =>
      v.file.includes("__self_test_planted__"),
    );
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("Q. planted remedy-less control flagged ", noRemedyFlagged, true);
  check("R. the wired control is cleared        ", withRemedyFlagged, false);
  check("S. the census does not forgive rule 3  ", noRemedyForgiven, false);

  // RULE 4 — the legacy pair alone cannot name the fourth state, so a surface
  // reading only it waits forever under a failed read (the five surfaces of
  // 2026-09-19).
  const legacyPair = `"use client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
export function Planted() {
  const { canLoad, organizationRequired, resolving } = useOrganizationRequired();
  if (organizationRequired) return <Refusal />;
  if (resolving) return <Skeleton />;
  return <Body canLoad={canLoad} />;
}
`;
  const withDiscriminant = legacyPair.replace(
    "const { canLoad, organizationRequired, resolving } = useOrganizationRequired();",
    "const { canLoad, organizationState } = useOrganizationRequired();",
  );
  const callGuardOnly = `"use client";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
export function Planted() {
  const { organizationId, canLoad } = useOrganizationRequired();
  useEffect(() => { if (!canLoad) return; void load(organizationId); }, [canLoad]);
  return <Body />;
}
`;
  check("T. the legacy pair alone is seen      ", readsTheLegacyPairOnly(legacyPair), true);
  check("U. the discriminant clears it         ", readsTheLegacyPairOnly(withDiscriminant), false);
  check("V. a call guard is untouched          ", readsTheLegacyPairOnly(callGuardOnly), false);

  let legacyFlagged = false;
  let discriminantFlagged = true;
  let legacyForgiven = true;
  try {
    writeFileSync(PLANTED, legacyPair, "utf8");
    legacyFlagged = scan({ useCensus: false }).some(
      (v) => v.file.includes("__self_test_planted__") && v.why.includes("LEGACY BOOLEANS"),
    );
    legacyForgiven = !scan({
      census: new Set([relative(ROOT, PLANTED)]),
    }).some((v) => v.file.includes("__self_test_planted__"));
    writeFileSync(PLANTED, withDiscriminant, "utf8");
    discriminantFlagged = scan({ useCensus: false }).some((v) =>
      v.file.includes("__self_test_planted__"),
    );
  } finally {
    try {
      unlinkSync(PLANTED);
    } catch {
      /* already gone */
    }
  }
  check("W. planted legacy-pair module flagged ", legacyFlagged, true);
  check("X. the repaired module is cleared     ", discriminantFlagged, false);
  check("Y. the census does not forgive rule 4 ", legacyForgiven, false);

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
