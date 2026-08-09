/**
 * Shared types for the No Dead Ends detector.
 *
 * The report shape is a PUBLISHED contract: `scripts/dead-ends/report.json` is
 * committed and read by the admin dashboard
 * (`features/admin/dead-ends/`). Changing a field here means changing the
 * dashboard in the same commit.
 */

/** Detection rules, worst-first. Ids are stable — the report and the
 *  allowlist both key on them. */
export type DeadEndRuleId =
  | "bare-id-text"
  | "unlinked-entity-name"
  | "unlinked-count"
  | "no-doors-in-file";

export type DeadEndSeverity = "high" | "medium" | "low";

export interface DeadEndFinding {
  /** Repo-relative path, POSIX separators. */
  file: string;
  /** 1-indexed line of the offending JSX expression. */
  line: number;
  /** 1-indexed column. */
  column: number;
  rule: DeadEndRuleId;
  severity: DeadEndSeverity;
  /**
   * Canonical entity token when we could infer one (`agent`, `note`, …),
   * otherwise the raw object root we saw (`row`, `item`) prefixed with `?`.
   */
  entity: string;
  /** Whether the inferred token has an `hrefFor` in the entity registry. */
  entityHasRoute: boolean;
  /**
   * The source text of the offending expression, e.g. `row.agentName`.
   * The human sentence is DERIVED from these fields via
   * `describeFinding()` — never stored, so the CLI and the dashboard can
   * never disagree and the committed report stays small.
   */
  expression: string;
  /** The `features/x` or `app/(group)/y` bucket, for the worst-features table. */
  feature: string;
  /** Best-effort route this file renders on, when it lives under `app/`. */
  route: string | null;
}

export interface DeadEndAllowlistEntry {
  /** Repo-relative path or a `path` + `rule` pair. Exact match, no globs on
   *  purpose — a glob hides how much it is silencing. */
  file: string;
  /** Limit the exemption to one rule. Omit to exempt the whole file. */
  rule?: DeadEndRuleId;
  /** MANDATORY. A bare path list is banned — an exemption nobody can review
   *  is how the class comes back. */
  reason: string;
  /** Who decided, so a stale exemption can be chased down. */
  addedBy: string;
  /** ISO date the exemption was added. */
  addedOn: string;
}

export interface DeadEndReportTotals {
  findings: number;
  high: number;
  medium: number;
  low: number;
  filesWithFindings: number;
  filesScanned: number;
  allowlisted: number;
}

export interface DeadEndBucket {
  key: string;
  count: number;
  high: number;
}

export interface DeadEndReport {
  /** ISO timestamp of the scan. */
  generatedAt: string;
  /** Git SHA the scan ran against, when resolvable. */
  commit: string | null;
  totals: DeadEndReportTotals;
  byRule: Record<DeadEndRuleId, number>;
  /** Worst files, ranked. */
  worstFiles: DeadEndBucket[];
  /** Worst features/route-groups, ranked. */
  worstFeatures: DeadEndBucket[];
  findings: DeadEndFinding[];
  /** Allowlist entries currently in force, echoed so the dashboard can show
   *  what is deliberately silenced and why. */
  allowlist: DeadEndAllowlistEntry[];
}

export interface DeadEndHistoryPoint {
  generatedAt: string;
  commit: string | null;
  findings: number;
  high: number;
  medium: number;
  low: number;
  filesWithFindings: number;
}

export const RULE_TITLES: Record<DeadEndRuleId, string> = {
  "bare-id-text": "Bare id rendered as text",
  "unlinked-entity-name": "Entity name rendered with no door",
  "unlinked-count": "Count of records with no way to reach them",
  "no-doors-in-file": "Surface names records and imports no door primitive",
};

export const RULE_DOCTRINE: Record<DeadEndRuleId, string> = {
  "bare-id-text":
    "Never show an id you can't open. Resolve it to a name plus a door, or don't show it.",
  "unlinked-entity-name":
    "If you render it by name, you must let them open it. Every reference is a door.",
  "unlinked-count":
    "A count is a door too — every number that describes records must reach those records.",
  "no-doors-in-file":
    "The Inventory Law: don't build a poorer surface than the platform already gives you.",
};
