/**
 * Shared types for the ESLint debt inventory.
 *
 * The report shape is a PUBLISHED contract: `scripts/lint-debt/report.json` is
 * committed and read by the admin scoreboard (`features/admin/lint-debt/`).
 * Changing a field here means changing the scoreboard in the same commit.
 *
 * Twin of `scripts/dead-ends/types.ts` — same snapshot pattern, same laws
 * (LOUD, NEVER BLOCKING; the scoreboard reads a committed file, never a live
 * scan). What differs is the source: this one does not implement its own AST
 * rules, it runs the repo's real ESLint config and inventories what comes back.
 * That is deliberate — a second copy of the lint rules would be a second
 * authority, and the whole point of this report is to show what the ONE
 * authority actually says.
 */

/**
 * What KIND of debt a rule represents. This is the field the campaign is
 * steered by, and the reason a raw 2,486-error count was useless: it mixed
 * genuine rendering bugs in with compiler-lint style notes, so nobody could
 * tell whether the number mattered.
 *
 * - `bug`        — the code is wrong at runtime today. Fix on sight.
 * - `correctness`— a real hazard class (crashes, cascading renders, torn refs)
 *                  that is usually but not always live. Fix deliberately.
 * - `doctrine`   — this repo's own architectural bans. Never "fixed" with a
 *                  disable; the import/shape is what changes.
 * - `style`      — true style/idiom. Lowest priority, never worth a risky edit.
 */
export type LintDebtClass = "bug" | "correctness" | "doctrine" | "style";

export const LINT_DEBT_CLASSES: LintDebtClass[] = ["bug", "correctness", "doctrine", "style"];

export interface LintDebtFinding {
  /** Repo-relative path, POSIX separators. */
  file: string;
  /** 1-indexed line. */
  line: number;
  /** 1-indexed column. */
  column: number;
  /** ESLint rule id exactly as the config emits it, e.g. `react-hooks/refs`. */
  rule: string;
  /** The `features/x` / `app/(group)` bucket, for the worst-features table. */
  feature: string;
  /** Best-effort route this file renders on, when it lives under `app/`. */
  route: string | null;
  /**
   * ESLint's own message, truncated. Kept because a repair brief without the
   * message sends the reader back to the terminal, which is the dead end this
   * page exists to remove. Truncated because 2.5k of them is the snapshot.
   */
  message: string;
}

export interface LintDebtRuleBucket {
  rule: string;
  count: number;
  klass: LintDebtClass;
}

export interface LintDebtBucket {
  key: string;
  count: number;
  /** How many of this bucket's findings are `bug` or `correctness`. */
  real: number;
}

export interface LintDebtTotals {
  /** Every error-severity message. Warnings are NOT counted — see scan.ts. */
  errors: number;
  filesWithFindings: number;
  filesScanned: number;
  byClass: Record<LintDebtClass, number>;
}

export interface LintDebtReport {
  generatedAt: string;
  commit: string | null;
  totals: LintDebtTotals;
  byRule: LintDebtRuleBucket[];
  worstFiles: LintDebtBucket[];
  worstFeatures: LintDebtBucket[];
  findings: LintDebtFinding[];
}

export interface LintDebtHistoryPoint {
  generatedAt: string;
  commit: string | null;
  errors: number;
  filesWithFindings: number;
  byClass: Record<LintDebtClass, number>;
}

/**
 * How every rule in this repo's config is classified, and WHY.
 *
 * A rule with no entry here lands in `style` and is listed on the scoreboard as
 * unclassified — loud, so a newly-enabled rule cannot silently join the backlog
 * at the bottom of the priority list. Add the entry in the same change that
 * turns the rule on.
 */
export const RULE_CLASS: Record<string, LintDebtClass> = {
  // ── bug: wrong at runtime today ─────────────────────────────────────────
  // Missing keys make React reuse the wrong DOM node on reorder — stale inputs,
  // lost focus, wrong row highlighted. Always a real defect.
  "react/jsx-key": "bug",
  // `module` is a real binding in the CommonJS wrappers Next emits; assigning
  // it breaks the chunk at runtime.
  "@next/next/no-assign-module-variable": "bug",
  // `<a href="/route">` to an internal page does a full document load: state
  // lost, no prefetch, transitions skipped.
  "@next/next/no-html-link-for-pages": "bug",
  // Hooks called conditionally / in loops desynchronise the hook list — React
  // throws "rendered fewer hooks than expected" the moment the branch flips.
  "react-hooks/rules-of-hooks": "bug",

  // ── correctness: real hazard classes ────────────────────────────────────
  // The cascading-render class. setState inside an effect that runs on data it
  // just changed is exactly the loop that has frozen whole browsers here —
  // see features/notes/FEATURE.md § Freeze-loop doctrine.
  "react-hooks/set-state-in-effect": "correctness",
  // Reading/writing a ref during render tears under concurrent rendering and
  // under the compiler's memoization.
  "react-hooks/refs": "correctness",
  // Mutating props/state/values the compiler assumes are frozen — silently
  // wrong output once memoization kicks in.
  "react-hooks/immutability": "correctness",
  // Side effects during render.
  "react-hooks/purity": "correctness",
  // A component defined inside another component is a NEW type every render:
  // the whole subtree unmounts and remounts, losing state and focus.
  "react-hooks/static-components": "correctness",
  // Hooks called from inside an error boundary's render path.
  "react-hooks/error-boundaries": "correctness",
  "react-hooks/preserve-manual-memoization": "correctness",
  "react-hooks/use-memo": "correctness",
  "react/no-children-prop": "correctness",

  // ── doctrine: this repo's architectural bans ────────────────────────────
  // These are never "fixed" by silencing. The import or the shape changes.
  "no-restricted-imports": "doctrine",
  "no-restricted-syntax": "doctrine",
  "matrx/no-bespoke-stream-renderer": "doctrine",
  "matrx/no-raw-agent-list-query": "doctrine",

  // ── style ───────────────────────────────────────────────────────────────
  "react/display-name": "style",
  "react/jsx-no-comment-textnodes": "style",
};

export const CLASS_TITLES: Record<LintDebtClass, string> = {
  bug: "Real bugs",
  correctness: "Correctness hazards",
  doctrine: "Doctrine violations",
  style: "Style / idiom",
};

export const CLASS_DOCTRINE: Record<LintDebtClass, string> = {
  bug: "Wrong at runtime today. Fix on sight — these are defects, not lint.",
  correctness:
    "A real hazard class: crashes, cascading renders, torn refs, remounted subtrees. Fix deliberately, verify the surface.",
  doctrine:
    "This repo's own architectural bans. Never silence one — change the import or the shape it points at.",
  style: "True idiom. Lowest priority; never worth a risky edit to clear.",
};

/** Rules with no `RULE_CLASS` entry default here, and are flagged as such. */
export const UNCLASSIFIED_CLASS: LintDebtClass = "style";

export function classOf(rule: string): LintDebtClass {
  return RULE_CLASS[rule] ?? UNCLASSIFIED_CLASS;
}

export function isReal(klass: LintDebtClass): boolean {
  return klass === "bug" || klass === "correctness";
}
