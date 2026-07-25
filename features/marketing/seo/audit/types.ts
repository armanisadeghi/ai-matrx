/**
 * Shared shapes for the deterministic page-audit evaluators (social card,
 * heading structure, indexability). EXACT mirrors of the Python
 * implementation in aidream `packages/matrx-scraper/matrx_scraper/
 * audit_metrics.py` — evaluation logic, thresholds, AND issue strings are
 * byte-identical (parity locked by `audit.parity.test.ts`).
 *
 * Persisted contract: `web.snapshot.audit_metrics` (v1), stamped by the
 * scraper on every capture — see `stored.ts`.
 */

export type AuditSeverity = "error" | "warning";

export interface AuditIssue {
  severity: AuditSeverity;
  message: string;
}

/** True when no error-severity issues are present (warnings allowed). */
export function issuesOk(issues: AuditIssue[]): boolean {
  return issues.every((issue) => issue.severity !== "error");
}
